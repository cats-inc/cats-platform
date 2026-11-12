import { createHash, randomUUID } from 'node:crypto';
import { ProviderPolicyFormatError, parseProviderExecutionPolicy, assertProviderPolicyBoundary } from '../../../shared/providerExecutionPolicy.js';
import { normalizeOwnerLifecycle, OwnerLifecycleFormatError } from '../../../core/ownerLifecycle.js';
import { compactOwnerWorkflowHistory } from './ownerHistory.js';
import { keepRaisedProductScopes } from './model/productScope.js';
import { keepProposalProgress } from './conversationProposals.js';
import { keepOwnerWorkProjects } from './model/workProject.js';
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { MessagePage, MessageSearchHit, MessageSearchOptions } from '../shared/transcript.js';
import { materializedMessagePage } from './materializedMessagePage.js';
import type { ChatPresentationSnapshot, ChatMessageWindow } from './presentation.js';
import type { ConversationArchiveResult } from '../shared/conversationArchive.js';

import type { ChatState, ChatChannelState } from '../api/contracts.js';
import type { ChannelProjectionMetadata } from './core-projection/scoped.js';
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

/**
 * SPEC-141 D2: a write never lowers a conversation's product scope. A caller that read the whole
 * chat before a raise and writes its copy back keeps the raise (see `keepRaisedProductScopes`).
 */
function keepStoredProductScopes(source: string, stored: ChatState, incoming: ChatState): ChatState {
  const { state, keptChannelIds } = keepRaisedProductScopes(stored, incoming);
  if (keptChannelIds.length > 0) {
    reportStoreDiagnostic('product_scope_kept', { store: source, channelIds: keptChannelIds });
  }
  // SPEC-142 FR-18: nor does it reopen a proposal's card or drop one posted meanwhile.
  const proposals = keepProposalProgress(stored, state);
  if (proposals.keptChannelIds.length > 0) {
    reportStoreDiagnostic('proposal_progress_kept', { store: source, channelIds: proposals.keptChannelIds });
  }
  // SPEC-142 FR-23: nor does it undo the owner's change of a conversation's Project.
  const kept = keepOwnerWorkProjects(stored, proposals.state);
  if (kept.keptChannelIds.length > 0) {
    reportStoreDiagnostic('work_project_kept', { store: source, channelIds: kept.keptChannelIds });
  }
  return kept.state;
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
  /** Stop disk connections before the authorized reset removes their files. */
  removeOwnedState?(remove: () => Promise<void>): Promise<void>;
  /** Admit a data reset before mutation and coordinate every store call through erasure. */
  withDataReset?<T>(operation: () => Promise<T>): Promise<T>;
  /** A dispatch-local view: metadata plus only the requested channel's transcript. */
  readChannelState?(id: string): Promise<ChatState>;
  readMessagePage?(id: string, limit?: number, before?: string): Promise<MessagePage>;
  searchMessages?(query: string, options?: MessageSearchOptions): Promise<MessageSearchHit[]>;
  /** Explicit startup/write invariant preparation, separate from import equality. */
  prepareTranscriptReads?(): Promise<void>;
  /** Start nonblocking profile maintenance after application recovery. */
  startMaintenance?(): void;
  readPresentation?(channelId?: string): Promise<ChatPresentationSnapshot>;
  readMessageWindow?(id: string, limit?: number, before?: string): Promise<ChatMessageWindow>;
  /** Synchronous existing-channel mutation; optional metadata is limited to derived memory. */
  updateChannel?(id: string, mutator: ChatChannelMutator): Promise<ChatChannelState | null>;
  /** Explicit product maintenance. Production performs compression/index preparation off-thread. */
  archiveConversation?(id: string, action: 'archive' | 'restore', options?: { signal?: AbortSignal }): Promise<ConversationArchiveResult>;
}

export type ChatMetadata = Omit<ChatState, 'channels'>;
export interface ChatChannelMutationContext {
  readonly chat: ChatMetadata;
  readonly core: CatsCoreState;
  readonly channelCatalog: ChannelProjectionMetadata[];
}
export type ChatChannelMutator = (channel: ChatChannelState,
  context: ChatChannelMutationContext) => { channel: ChatChannelState; metadata?: ChatMetadata };

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

/**
 * Keeps an upgrade's original bytes before the profile is rewritten, and returns the path that
 * holds them.
 * - Under `basePath` when that name is free or already holds these bytes (a repeat start).
 * - Otherwise next to it, under a name that carries the bytes' digest. An earlier upgrade's
 *   different bytes can hold the base name: the owner went back to an older build with the
 *   restore recipe and saved. Refusing then would block every later start.
 * - Written through a temporary file and a rename, so a crash never leaves a partial backup.
 * - Anything but a regular file under a name refuses the upgrade, which leaves the original as
 *   it is.
 */
async function keepUpgradeBackup(basePath: string, raw: string): Promise<string> {
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 12);
  for (const candidate of [basePath, basePath.replace(/\.bak$/u, `.${digest}.bak`)]) {
    const existing = await lstat(candidate).catch((error: unknown) => {
      if (isErrnoException(error) && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!existing) {
      const tempPath = path.join(path.dirname(candidate), `.${path.basename(candidate)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        await writeFile(tempPath, raw, { encoding: 'utf8', flag: 'wx' });
        await rename(tempPath, candidate);
      } finally {
        await rm(tempPath, { force: true }).catch(() => {});
      }
      if (await readFile(candidate, 'utf8') !== raw) throw new Error(`Upgrade backup ${candidate} did not verify.`);
      return candidate;
    }
    if (!existing.isFile()) throw new Error(`Upgrade backup ${candidate} is not a file.`);
    if (await readFile(candidate, 'utf8') === raw) return candidate;
  }
  throw new Error(`Both upgrade backup names next to ${basePath} hold other bytes.`);
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

/** Pure admission/upgrade on an already backed-up import, never the user's source file. */
export function normalizeImportedChatSnapshot(raw: unknown): PersistedChatSnapshot {
  const repaired = repairPersistedSetupCompletion(normalizePersistedChatSnapshot(raw));
  return migrateCompanionSkillProfiles(repaired)?.snapshot ?? repaired;
}

/** The persistent backends share lifecycle, scope, proposal and Project invariants. */
export function prepareChatSnapshot(stored: ChatState, incoming: ChatState, core: CatsCoreState,
  source: string, now?: Date): PersistedChatSnapshot {
  if (core.version !== CATS_CORE_STATE_VERSION) throw new OwnerLifecycleFormatError();
  normalizeOwnerLifecycle(core.ownerLifecycle);
  for (const channel of incoming.channels) {
    const policy = parseProviderExecutionPolicy(channel.runtimeExecutionPolicy);
    assertProviderPolicyBoundary(policy, {
      workspaceAccess: channel.runtimeWorkspaceAccess, permissionMode: channel.runtimePermissionMode,
    });
  }
  const chat = compactOwnerWorkflowHistory(
    structuredClone(keepStoredProductScopes(source, stored, incoming)), core);
  const projected = syncCoreStateWithChatState(chat, structuredClone(core), now);
  return repairPersistedSetupCompletion(buildPersistedChatSnapshot(chat, { ...core, ...projected }));
}

/** Legacy import/baseline fixture backend; live startup uses DatabaseChatStore. */
export class LegacyJsonChatStore implements ChatStore {
  private mutationQueue: Promise<void> = Promise.resolve();
  private lastKnownSnapshot: PersistedChatSnapshot | null = null;
  /**
   * The primary file's exact text from its last clean read, with the snapshot it
   * normalized to. Normalizing re-projects every channel into Core, which costs
   * far more than reading the file, and most reads see unchanged text. Every read
   * still loads the file, so a write by anyone, including another process, is seen.
   * The snapshot is never handed out: callers get a clone.
   */
  private cleanPrimary: { raw: string; snapshot: PersistedChatSnapshot } | null = null;
  private readonly coreListeners = new Set<CoreStoreListener>();

  constructor(private readonly filePath: string) {}

  private reuseCleanPrimary(filePath: string, raw: string): PersistedChatSnapshot | null {
    const cached = this.cleanPrimary;
    return filePath === this.filePath && cached?.raw === raw ? structuredClone(cached.snapshot) : null;
  }

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
    stored: ChatState,
  ): Promise<PersistedChatSnapshot> {
    const nextChatState = compactOwnerWorkflowHistory(
      structuredClone(keepStoredProductScopes(this.filePath, stored, chat)), core);
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
    // Text that already read clean needs no upgrade, repair or migration write-back.
    const reused = this.reuseCleanPrimary(filePath, raw);
    if (reused) {
      return reused;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizePersistedChatSnapshot(parsed as unknown);
    if (parsed.version !== CATS_CORE_STATE_VERSION) {
      // Each version is an admission boundary: an older reader refuses the newer file instead
      // of discarding what it does not know. Version 6 brought provider policies; version 7
      // (SPEC-141 D9) the product scope a raise sets. Each upgrade keeps the original bytes
      // under its own name, so a profile that already went through the version 6 upgrade, whose
      // `.pre-provider-policy.bak` holds older bytes, can still go to 7.
      const fromVersion6 = parsed?.version === 6;
      const backupPath = `${this.filePath}.${fromVersion6 ? 'pre-product-scope' : 'pre-provider-policy'}.bak`;
      try {
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed.chat ?? parsed).channels)
          || !Array.isArray((parsed.chat ?? parsed).cats)) throw new Error('Unrecognized profile');
        // The original bytes are kept first, on the primary and on the `.bak` recovery path
        // alike: recovery writes the upgraded primary and later writes rotate `.bak`, so this
        // backup can be the only copy of the older bytes. Only the primary is rewritten here;
        // `recoverFromBackup` writes the primary from what a `.bak` read returns.
        await keepUpgradeBackup(backupPath, raw);
        if (filePath === this.filePath) await writePersistedChatSnapshot(this.filePath, normalized);
      } catch {
        throw new ProviderPolicyFormatError(fromVersion6
          ? 'Product scope profile upgrade failed; original data was preserved.'
          : 'Provider policy profile upgrade failed; original data was preserved.');
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
      const reused = this.reuseCleanPrimary(this.filePath, raw);
      if (reused) {
        return reused;
      }
      const parsed = JSON.parse(raw);
      const snapshot = normalizePersistedChatSnapshot(parsed as unknown);
      if (parsed.version !== CATS_CORE_STATE_VERSION) return null;
      if (repairPersistedSetupCompletion(snapshot) !== snapshot || migrateCompanionSkillProfiles(snapshot) !== null) {
        return null;
      }
      this.cleanPrimary = { raw, snapshot: structuredClone(snapshot) };
      return snapshot;
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
      const previous = await this.readPersistedSnapshotUnsafe();
      const previousCore = extractCoreState(previous);
      const persisted = await this.writeSnapshotUnsafe(chat, core, previous.chat);
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
      const persisted = await this.writeSnapshotUnsafe(next.chat, next.core, current.chat);
      const nextCore = extractCoreState(persisted);
      if (hasSubstantiveCoreChange(previousCore, nextCore)) this.emitCoreChange(nextCore);
      return persisted;
    });
  }

  async write(state: ChatState): Promise<ChatState> {
    return this.runExclusive(async () => {
      const current = await this.readPersistedSnapshotUnsafe();
      const currentCore = extractCoreState(current);
      // The caller gets its state back as before, with any product scope the store kept.
      const nextChatState = keepStoredProductScopes(this.filePath, current.chat, structuredClone(state));
      const persisted = await this.writeSnapshotUnsafe(nextChatState, currentCore, current.chat);
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
      const persisted = await this.writeSnapshotUnsafe(currentSnapshot.chat, state, currentSnapshot.chat);
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
      const persisted = await this.writeSnapshotUnsafe(current.chat, nextCore, current.chat);
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
  async readMessagePage(id: string, limit = 50, before?: string): Promise<MessagePage> {
    return this.runExclusive(() => {
      const channel = this.chatState.channels.find(value => value.id === id);
      if (!channel) throw new Error(`Channel not found: ${id}`);
      return materializedMessagePage(channel, this.messageOrderRevisions.get(id) ?? 0, limit, before);
    });
  }
  private readonly messageOrderRevisions = new Map<string, number>();
  private mutationQueue: Promise<void> = Promise.resolve();
  private chatState: ChatState;
  private coreState: CatsCoreState;
  private readonly coreListeners = new Set<CoreStoreListener>();

  constructor(
    initialState: ChatState | CatsCoreState | PersistedChatSnapshot = createDefaultChatState(),
  ) {
    const snapshot = normalizeImportedChatSnapshot(initialState);
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
    const snapshot = this.applySnapshotState(keepStoredProductScopes('memory', this.chatState, chat), core);
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
    const next = compactOwnerWorkflowHistory(structuredClone(chat), core);
    const nextIds = new Set(next.channels.map(channel => channel.id));
    const previousById = new Map(this.chatState.channels.map(channel => [channel.id, channel]));
    for (const channel of next.channels) {
      const previous = previousById.get(channel.id);
      // Tail appends and body edits preserve every existing position. Any other
      // order/deletion change advances the generation, matching the SQL store.
      if (previous?.messages.some((message, index) => channel.messages[index]?.id !== message.id)) {
        this.messageOrderRevisions.set(channel.id, (this.messageOrderRevisions.get(channel.id) ?? 0) + 1);
      }
    }
    for (const channel of this.chatState.channels) {
      if (!nextIds.has(channel.id)) {
        this.messageOrderRevisions.set(channel.id, (this.messageOrderRevisions.get(channel.id) ?? 0) + 1);
      }
    }
    this.chatState = next;
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(core));
    return buildPersistedChatSnapshot(this.chatState, this.coreState);
  }
}
