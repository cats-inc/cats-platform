import { randomUUID } from 'node:crypto';
import { ProviderPolicyFormatError, parseProviderExecutionPolicy, assertProviderPolicyBoundary } from '../../../shared/providerExecutionPolicy.js';
import { normalizeOwnerLifecycle, OwnerLifecycleFormatError } from '../../../core/ownerLifecycle.js';
import { compactOwnerWorkflowHistory } from './ownerHistory.js';
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { ChatState } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import { CATS_CORE_STATE_VERSION } from '../../../core/types.js';
import {
  hasSubstantiveCoreChange,
  type CoreStore,
  type CoreStoreListener,
} from '../../../core/store.js';
import { createDefaultChatState } from './defaults.js';
import { createDefaultCoreState } from '../../../core/model/index.js';
import { syncCoreStateWithChatState } from './core-projection/index.js';
import { normalizePersistedChatSnapshot } from './chat-snapshot/index.js';
import type { PersistedChatSnapshot } from './core-snapshot/index.js';
import {
  buildPersistedChatSnapshot,
  extractCoreState,
} from './core-snapshot/index.js';
import { resolveSetupCompletionTimestamp } from './setupCompletion.js';
import {
  migrateCompanionSkillProfiles,
  resolveCompanionRoleMigrationBackupPath,
} from './companionRoleMigration.js';

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function reportStoreDiagnostic(
  scope: string,
  details: Record<string, unknown>,
): void {
  const serialized = Object.entries(details)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  process.stderr.write(`[cats-platform-store] ${scope}${serialized ? ` ${serialized}` : ''}\n`);
}

export interface ChatStore extends CoreStore {
  read(): Promise<ChatState>;
  write(state: ChatState): Promise<ChatState>;
  writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot>;
  /** Pure, atomic Chat/Core mutation. Callers must not perform external work in the callback. */
  updateSnapshot?(mutator: ChatSnapshotMutator): Promise<PersistedChatSnapshot>;
}

export type ChatSnapshotMutator = (snapshot: { chat: ChatState; core: CatsCoreState })
  => { chat: ChatState; core: CatsCoreState };

/** Apply a synchronous product mutation to the latest Chat, preserving concurrent Core writes. */
export async function updateChatState(store: ChatStore, mutate: (state: ChatState) => ChatState): Promise<ChatState> {
  if (store.updateSnapshot) return (await store.updateSnapshot(({ chat, core }) => ({ chat: mutate(chat), core }))).chat;
  return store.write(mutate(await store.read()));
}

type CoreStateMutator = (
  state: CatsCoreState,
) => CatsCoreState | Promise<CatsCoreState>;

async function writePersistedChatSnapshot(
  filePath: string,
  snapshot: PersistedChatSnapshot,
  options: { preserveBackup?: boolean } = {},
): Promise<void> {
  // A future writer may have updated its backup before crashing. Never rotate
  // an unknown policy out of either copy, even when the primary still parses.
  for (const source of [filePath, `${filePath}.bak`]) {
    try {
      const previous = JSON.parse(await readFile(source, 'utf8'));
      if (previous?.version !== undefined && (!Number.isInteger(previous.version) || previous.version < 1 || previous.version > CATS_CORE_STATE_VERSION)) throw new OwnerLifecycleFormatError();
      for (const channel of previous?.chat?.channels ?? []) {
        const policy = parseProviderExecutionPolicy(channel.runtimeExecutionPolicy);
        assertProviderPolicyBoundary(policy, { workspaceAccess: channel.runtimeWorkspaceAccess, permissionMode: channel.runtimePermissionMode });
      }
    } catch (error) {
      if (error instanceof ProviderPolicyFormatError || error instanceof OwnerLifecycleFormatError) throw error;
      if (!(error instanceof SyntaxError) && !(isErrnoException(error) && error.code === 'ENOENT')) throw error;
    }
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const backupPath = `${filePath}.bak`;

  try {
    await writeFile(tempPath, serialized, 'utf-8');
    try {
      const historyEntries = Object.entries(snapshot.ownerLifecycle?.entries ?? {}).filter(([key, entry]) =>
        entry.deleted || (key.startsWith('run:') || key.startsWith('mission:')) && entry.logsClearedAt);
      const removedLinkIds = snapshot.ownerLifecycle?.removedLinkIds ?? [];
      if (options.preserveBackup) {
        // Recovery must never rotate a damaged primary over the valid backup.
      } else if (historyEntries.length || removedLinkIds.length) {
        // A normal backup must not resurrect history the owner explicitly cleared.
        // Preserve the previous profile's other data, applying only committed cleanup intent.
        const previousRaw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
        const previous = normalizePersistedChatSnapshot(previousRaw);
        const lifecycle = structuredClone(previous.ownerLifecycle ?? snapshot.ownerLifecycle!);
        for (const [key, entry] of historyEntries) lifecycle.entries[key] = { ...entry };
        lifecycle.removedLinkIds = [...new Set([...(lifecycle.removedLinkIds ?? []), ...removedLinkIds])];
        lifecycle.revision = Math.max(lifecycle.revision, snapshot.ownerLifecycle?.revision ?? 0);
        lifecycle.receipts = structuredClone(snapshot.ownerLifecycle?.receipts ?? lifecycle.receipts);
        const previousCore = { ...extractCoreState(previous), ownerLifecycle: lifecycle };
        const previousChat = compactOwnerWorkflowHistory(previous.chat, previousCore);
        const sanitized = buildPersistedChatSnapshot(previousChat, syncCoreStateWithChatState(previousChat, previousCore));
        const backupTemporary = `${tempPath}.bak`;
        try {
          await writeFile(backupTemporary, `${JSON.stringify({ ...previousRaw, ...sanitized }, null, 2)}\n`, 'utf8');
          await rename(backupTemporary, backupPath);
        } finally { await rm(backupTemporary, { force: true }).catch(() => {}); }
      } else await copyFile(filePath, backupPath);
    } catch (error) {
      if (!(isErrnoException(error) && error.code === 'ENOENT')) {
        throw error;
      }
    }
    // rename() replaces the destination atomically on POSIX and Windows, so
    // readers never observe a missing primary snapshot. Windows can transiently
    // refuse the replace while another handle touches the destination, so retry
    // instead of falling back to delete-then-rename, which would reopen the
    // missing-file window this function exists to prevent.
    let lastReplaceError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await rename(tempPath, filePath);
        lastReplaceError = null;
        break;
      } catch (error) {
        if (!(isErrnoException(error)
          && (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EEXIST'))) {
          throw error;
        }
        lastReplaceError = error;
        await new Promise((resolve) => setTimeout(resolve, 5 * (attempt + 1)));
      }
    }
    if (lastReplaceError) {
      throw lastReplaceError;
    }
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
}

function createDefaultSnapshot(now: Date = new Date()): PersistedChatSnapshot {
  const chat = createDefaultChatState();
  const core = syncCoreStateWithChatState(chat, createDefaultCoreState());
  return buildPersistedChatSnapshot(chat, {
    ...core,
    updatedAt: now.toISOString(),
  });
}

function repairPersistedSetupCompletion(
  snapshot: PersistedChatSnapshot,
  now: Date = new Date(),
): PersistedChatSnapshot {
  const repairedSetupCompleteAt = resolveSetupCompletionTimestamp(snapshot.chat, {
    explicitSetupCompleteAt: snapshot.setupCompleteAt,
    ownerDisplayName: snapshot.ownerProfile.displayName,
    botBindingCount: snapshot.botBindings.length,
    fallbackTimestamp:
      snapshot.updatedAt
      || snapshot.ownerProfile.updatedAt
      || snapshot.chat.globalOrchestrator.updatedAt,
    now,
  });

  if (repairedSetupCompleteAt === snapshot.setupCompleteAt) {
    return snapshot;
  }

  return buildPersistedChatSnapshot(snapshot.chat, {
    ...extractCoreState(snapshot),
    setupCompleteAt: repairedSetupCompleteAt,
    updatedAt: snapshot.updatedAt || repairedSetupCompleteAt || now.toISOString(),
    ownerProfile: {
      ...snapshot.ownerProfile,
      updatedAt: snapshot.ownerProfile.updatedAt || repairedSetupCompleteAt || now.toISOString(),
    },
  });
}

export class FileChatStore implements ChatStore {
  private mutationQueue: Promise<void> = Promise.resolve();
  private lastKnownSnapshot: PersistedChatSnapshot | null = null;
  private readonly coreListeners = new Set<CoreStoreListener>();

  constructor(private readonly filePath: string) {}

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private cacheSnapshot(snapshot: PersistedChatSnapshot): PersistedChatSnapshot {
    this.lastKnownSnapshot = structuredClone(snapshot);
    return snapshot;
  }

  private async writeSnapshotUnsafe(
    chat: ChatState,
    core: CatsCoreState,
  ): Promise<PersistedChatSnapshot> {
    const nextChatState = compactOwnerWorkflowHistory(structuredClone(chat), core);
    const nextCore = syncCoreStateWithChatState(nextChatState, structuredClone(core));
    normalizeOwnerLifecycle(nextCore.ownerLifecycle);
    const snapshot = buildPersistedChatSnapshot(nextChatState, nextCore);
    await writePersistedChatSnapshot(this.filePath, snapshot);
    return structuredClone(this.cacheSnapshot(snapshot));
  }

  private emitCoreChange(core: CatsCoreState): CatsCoreState {
    const snapshot = structuredClone(core);
    for (const listener of this.coreListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        reportStoreDiagnostic('core_listener_failed', {
          filePath: this.filePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return snapshot;
  }

  private async tryReadSnapshotFile(filePath: string): Promise<PersistedChatSnapshot> {
    const raw = await readFile(filePath, 'utf-8');
    if (!raw.trim()) {
      throw new SyntaxError('Persisted chat snapshot is empty');
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizePersistedChatSnapshot(parsed as unknown);
    if (parsed.version !== CATS_CORE_STATE_VERSION) {
      // Version 6 is an admission boundary: old readers must reject new policies
      // instead of discarding their restrictions and continuing with legacy skip.
      const backupPath = `${this.filePath}.pre-provider-policy.bak`;
      try {
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed.chat ?? parsed).channels)
          || !Array.isArray((parsed.chat ?? parsed).cats)) throw new Error('Unrecognized profile');
        try { await writeFile(backupPath, raw, { encoding: 'utf8', flag: 'wx' }); }
        catch (error) {
          if (!(isErrnoException(error) && error.code === 'EEXIST') || await readFile(backupPath, 'utf8') !== raw) throw error;
        }
        if (filePath === this.filePath) await writePersistedChatSnapshot(this.filePath, normalized);
      } catch {
        throw new ProviderPolicyFormatError('Provider policy profile upgrade failed; original data was preserved.');
      }
    }
    const repaired = repairPersistedSetupCompletion(normalized);
    if (repaired.setupCompleteAt !== normalized.setupCompleteAt) {
      await writePersistedChatSnapshot(filePath, repaired);
    }
    return this.applyCompanionRoleMigration(repaired, raw, filePath);
  }

  /**
   * ADR-124 one-time upgrade. The original bytes are kept in a dedicated backup
   * that later writes never rotate; on the `.bak` recovery path the migrated
   * snapshot is only returned, and `recoverFromBackup` writes it to the primary.
   */
  private async applyCompanionRoleMigration(
    snapshot: PersistedChatSnapshot,
    raw: string,
    sourcePath: string,
  ): Promise<PersistedChatSnapshot> {
    let migration: ReturnType<typeof migrateCompanionSkillProfiles>;
    try {
      migration = migrateCompanionSkillProfiles(snapshot);
    } catch (error) {
      reportStoreDiagnostic('companion_role_migration_failed', {
        filePath: this.filePath,
        stage: 'validate',
        message: error instanceof Error ? error.message : String(error),
      });
      return snapshot;
    }
    if (!migration) {
      return snapshot;
    }

    const backupPath = resolveCompanionRoleMigrationBackupPath(this.filePath);
    try {
      await writeFile(backupPath, raw, { encoding: 'utf-8', flag: 'wx' });
    } catch (error) {
      // Only a regular file left by an earlier attempt counts as the kept backup.
      // Anything else occupying the path (a directory, say) is no backup at all.
      const existing = isErrnoException(error) && error.code === 'EEXIST'
        ? await lstat(backupPath).catch(() => null)
        : null;
      if (!existing?.isFile()) {
        reportStoreDiagnostic('companion_role_migration_failed', {
          filePath: this.filePath,
          stage: 'backup',
          backupPath,
          message: existing ? 'Backup path is not a regular file.'
            : error instanceof Error ? error.message : String(error),
        });
        return snapshot;
      }
    }

    if (sourcePath === this.filePath) {
      try {
        await writePersistedChatSnapshot(this.filePath, migration.snapshot);
      } catch (error) {
        reportStoreDiagnostic('companion_role_migration_failed', {
          filePath: this.filePath,
          stage: 'write',
          backupPath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    reportStoreDiagnostic('companion_role_migrated', {
      filePath: this.filePath,
      backupPath,
      catIds: migration.migratedCatIds,
    });
    return migration.snapshot;
  }

  private async recoverFromBackup(): Promise<PersistedChatSnapshot | null> {
    const backupPath = `${this.filePath}.bak`;
    try {
      const recovered = await this.tryReadSnapshotFile(backupPath);
      // A backup can predate a later opt-out. Recovery must never silently re-enable automatic cleanup.
      if (recovered.ownerLifecycle?.retention.enabled) {
        recovered.ownerLifecycle.retention.enabled = false;
        recovered.ownerLifecycle.retention.lastError = 'Automatic cleanup was disabled after profile recovery. Review the policy before enabling it again.';
        recovered.ownerLifecycle.revision++;
      }
      await writePersistedChatSnapshot(this.filePath, recovered, { preserveBackup: true });
      reportStoreDiagnostic('recover_from_backup', {
        filePath: this.filePath,
        backupPath,
        setupCompleteAt: recovered.setupCompleteAt,
        ownerDisplayName: recovered.ownerProfile.displayName,
      });
      return this.cacheSnapshot(recovered);
    } catch (error) {
      if (error instanceof ProviderPolicyFormatError || error instanceof OwnerLifecycleFormatError) throw error;
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return null;
      }
      reportStoreDiagnostic('recover_from_backup_failed', {
        filePath: this.filePath,
        backupPath,
        code: isErrnoException(error) ? error.code ?? null : null,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async readPersistedSnapshotUnsafe(): Promise<PersistedChatSnapshot> {
    try {
      return this.cacheSnapshot(await this.tryReadSnapshotFile(this.filePath));
    } catch (error) {
      if (error instanceof OwnerLifecycleFormatError || error instanceof ProviderPolicyFormatError) throw error;
      if (isErrnoException(error) && error.code === 'ENOENT') {
        if (this.lastKnownSnapshot) {
          reportStoreDiagnostic('snapshot_missing_primary_using_memory_cache', {
            filePath: this.filePath,
            setupCompleteAt: this.lastKnownSnapshot.setupCompleteAt,
          });
          return structuredClone(this.lastKnownSnapshot);
        }
        const recoveredFromBackup = await this.recoverFromBackup();
        if (recoveredFromBackup) {
          reportStoreDiagnostic('snapshot_missing_primary_recovered_from_backup', {
            filePath: this.filePath,
            setupCompleteAt: recoveredFromBackup.setupCompleteAt,
          });
          return structuredClone(recoveredFromBackup);
        }
        reportStoreDiagnostic('snapshot_missing_primary_creating_default', {
          filePath: this.filePath,
        });
        const snapshot = createDefaultSnapshot();
        await writePersistedChatSnapshot(this.filePath, snapshot);
        return this.cacheSnapshot(snapshot);
      }

      if (this.lastKnownSnapshot) {
        reportStoreDiagnostic('snapshot_read_failed_using_memory_cache', {
          filePath: this.filePath,
          code: isErrnoException(error) ? error.code ?? null : null,
          message: error instanceof Error ? error.message : String(error),
          setupCompleteAt: this.lastKnownSnapshot.setupCompleteAt,
        });
        return structuredClone(this.lastKnownSnapshot);
      }

      const recoveredFromBackup = await this.recoverFromBackup();
      if (recoveredFromBackup) {
        reportStoreDiagnostic('snapshot_read_failed_recovered_from_backup', {
          filePath: this.filePath,
          code: isErrnoException(error) ? error.code ?? null : null,
          message: error instanceof Error ? error.message : String(error),
          setupCompleteAt: recoveredFromBackup.setupCompleteAt,
        });
        return structuredClone(recoveredFromBackup);
      }

      reportStoreDiagnostic('snapshot_read_failed_creating_default', {
        filePath: this.filePath,
        code: isErrnoException(error) ? error.code ?? null : null,
        message: error instanceof Error ? error.message : String(error),
      });
      const snapshot = createDefaultSnapshot();
      await writePersistedChatSnapshot(this.filePath, snapshot);
      return this.cacheSnapshot(snapshot);
    }
  }

  /**
   * Reads never write. A snapshot that needs a write-back (a missing or corrupt
   * file, a setup repair, the ADR-124 migration) is re-read under the mutation
   * lock, so that write-back can never land after, and revert, a concurrent save.
   */
  private async readPersistedSnapshot(): Promise<PersistedChatSnapshot> {
    await this.mutationQueue;
    const clean = await this.tryReadCleanSnapshot();
    if (clean) {
      // An unlocked read may predate a save that already refreshed the cache.
      if (!this.lastKnownSnapshot) {
        this.cacheSnapshot(clean);
      }
      return clean;
    }
    return this.runExclusive(() => this.readPersistedSnapshotUnsafe());
  }

  /** The primary snapshot as persisted, or null when reading it needs a write. */
  private async tryReadCleanSnapshot(): Promise<PersistedChatSnapshot | null> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      if (!raw.trim()) {
        return null;
      }
      const parsed = JSON.parse(raw);
      const snapshot = normalizePersistedChatSnapshot(parsed as unknown);
      if (parsed.version !== CATS_CORE_STATE_VERSION) return null;
      return repairPersistedSetupCompletion(snapshot) === snapshot
        && migrateCompanionSkillProfiles(snapshot) === null
        ? snapshot
        : null;
    } catch (error) {
      if (error instanceof OwnerLifecycleFormatError || error instanceof ProviderPolicyFormatError) throw error;
      return null;
    }
  }

  async read(): Promise<ChatState> {
    return structuredClone((await this.readPersistedSnapshot()).chat);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(extractCoreState(await this.readPersistedSnapshot()));
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    return this.runExclusive(async () => {
      const previousCore = extractCoreState(await this.readPersistedSnapshotUnsafe());
      const persisted = await this.writeSnapshotUnsafe(chat, core);
      const nextCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(previousCore, nextCore)) {
        this.emitCoreChange(nextCore);
      }
      return persisted;
    });
  }

  async updateSnapshot(mutator: ChatSnapshotMutator): Promise<PersistedChatSnapshot> {
    return this.runExclusive(async () => {
      const current = await this.readPersistedSnapshotUnsafe();
      const previousCore = extractCoreState(current);
      const next = mutator({ chat: structuredClone(current.chat), core: structuredClone(previousCore) });
      if (isDeepStrictEqual(next.chat, current.chat) && isDeepStrictEqual(next.core, previousCore)) return current;
      const persisted = await this.writeSnapshotUnsafe(next.chat, next.core);
      const nextCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(previousCore, nextCore)) this.emitCoreChange(nextCore);
      return persisted;
    });
  }

  async write(state: ChatState): Promise<ChatState> {
    return this.runExclusive(async () => {
      const currentCore = extractCoreState(await this.readPersistedSnapshotUnsafe());
      const nextChatState = structuredClone(state);
      const persisted = await this.writeSnapshotUnsafe(nextChatState, currentCore);
      const nextCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(currentCore, nextCore)) {
        this.emitCoreChange(nextCore);
      }
      return structuredClone(nextChatState);
    });
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    return this.runExclusive(async () => {
      const currentSnapshot = await this.readPersistedSnapshotUnsafe();
      const previousCore = extractCoreState(currentSnapshot);
      const persisted = await this.writeSnapshotUnsafe(currentSnapshot.chat, state);
      const nextCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(previousCore, nextCore)) {
        return this.emitCoreChange(nextCore);
      }
      return nextCore;
    });
  }

  async updateCore(mutator: CoreStateMutator): Promise<CatsCoreState> {
    return this.runExclusive(async () => {
      const current = await this.readPersistedSnapshotUnsafe();
      const previousCore = extractCoreState(current);
      const nextCore = await mutator(structuredClone(previousCore));
      const persisted = await this.writeSnapshotUnsafe(current.chat, nextCore);
      const persistedCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(previousCore, persistedCore)) {
        return this.emitCoreChange(persistedCore);
      }
      return persistedCore;
    });
  }

  subscribeCore(listener: CoreStoreListener): () => void {
    this.coreListeners.add(listener);
    return () => {
      this.coreListeners.delete(listener);
    };
  }
}

export class MemoryChatStore implements ChatStore {
  private mutationQueue: Promise<void> = Promise.resolve();
  private chatState: ChatState;
  private coreState: CatsCoreState;
  private readonly coreListeners = new Set<CoreStoreListener>();

  constructor(
    initialState: ChatState | CatsCoreState | PersistedChatSnapshot = createDefaultChatState(),
  ) {
    const repaired = repairPersistedSetupCompletion(normalizePersistedChatSnapshot(initialState));
    const snapshot = migrateCompanionSkillProfiles(repaired)?.snapshot ?? repaired;
    this.chatState = snapshot.chat;
    this.coreState = extractCoreState(snapshot);
  }

  async read(): Promise<ChatState> {
    await this.mutationQueue;
    return structuredClone(this.chatState);
  }

  async readCore(): Promise<CatsCoreState> {
    await this.mutationQueue;
    return structuredClone(this.coreState);
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    return this.runExclusive(() => this.writeSnapshotUnsafe(chat, core));
  }

  private writeSnapshotUnsafe(chat: ChatState, core: CatsCoreState): PersistedChatSnapshot {
    const previousCore = this.coreState;
    const snapshot = this.applySnapshotState(chat, core);
    if (hasSubstantiveCoreChange(previousCore, this.coreState)) {
      this.emitCoreChange();
    }
    return structuredClone(snapshot);
  }

  async write(state: ChatState): Promise<ChatState> {
    return this.runExclusive(() => this.writeSnapshotUnsafe(state, this.coreState).chat);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    return this.runExclusive(() => extractCoreState(this.writeSnapshotUnsafe(this.chatState, state)));
  }

  async updateCore(mutator: CoreStateMutator): Promise<CatsCoreState> {
    return this.runExclusive(async () => {
      const nextCore = await mutator(structuredClone(this.coreState));
      return extractCoreState(this.writeSnapshotUnsafe(this.chatState, nextCore));
    });
  }

  async updateSnapshot(mutator: ChatSnapshotMutator): Promise<PersistedChatSnapshot> {
    return this.runExclusive(() => {
      const next = mutator({ chat: structuredClone(this.chatState), core: structuredClone(this.coreState) });
      if (isDeepStrictEqual(next.chat, this.chatState) && isDeepStrictEqual(next.core, this.coreState)) {
        return buildPersistedChatSnapshot(this.chatState, this.coreState);
      }
      return this.writeSnapshotUnsafe(next.chat, next.core);
    });
  }

  private async runExclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.mutationQueue;
    let release: () => void = () => {};
    this.mutationQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  subscribeCore(listener: CoreStoreListener): () => void {
    this.coreListeners.add(listener);
    return () => {
      this.coreListeners.delete(listener);
    };
  }

  private emitCoreChange(): void {
    const snapshot = structuredClone(this.coreState);
    for (const listener of this.coreListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        reportStoreDiagnostic('core_listener_failed', {
          store: 'memory',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private applySnapshotState(
    chat: ChatState,
    core: CatsCoreState,
  ): PersistedChatSnapshot {
    normalizeOwnerLifecycle(core.ownerLifecycle);
    this.chatState = compactOwnerWorkflowHistory(structuredClone(chat), core);
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(core));
    return buildPersistedChatSnapshot(this.chatState, this.coreState);
  }
}
