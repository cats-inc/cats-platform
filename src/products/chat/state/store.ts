import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChatState } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore, CoreStoreListener } from '../../../core/store.js';
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
}

type CoreStateMutator = (
  state: CatsCoreState,
) => CatsCoreState | Promise<CatsCoreState>;

function serializeCoreStateForNotification(core: CatsCoreState): string {
  const comparable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(core)) {
    if (key !== 'updatedAt') {
      comparable[key] = value;
    }
  }
  return JSON.stringify(comparable);
}

function hasSubstantiveCoreChange(
  previous: CatsCoreState,
  next: CatsCoreState,
): boolean {
  return serializeCoreStateForNotification(previous) !== serializeCoreStateForNotification(next);
}

async function writePersistedChatSnapshot(
  filePath: string,
  snapshot: PersistedChatSnapshot,
): Promise<void> {
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
      await copyFile(filePath, backupPath);
    } catch (error) {
      if (!(isErrnoException(error) && error.code === 'ENOENT')) {
        throw error;
      }
    }
    await rm(filePath, { force: true });
    await rename(tempPath, filePath);
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
    const nextChatState = structuredClone(chat);
    const nextCore = syncCoreStateWithChatState(nextChatState, structuredClone(core));
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
    const normalized = normalizePersistedChatSnapshot(JSON.parse(raw) as unknown);
    const repaired = repairPersistedSetupCompletion(normalized);
    if (repaired.setupCompleteAt !== normalized.setupCompleteAt) {
      await writePersistedChatSnapshot(filePath, repaired);
    }
    return repaired;
  }

  private async recoverFromBackup(): Promise<PersistedChatSnapshot | null> {
    const backupPath = `${this.filePath}.bak`;
    try {
      const recovered = await this.tryReadSnapshotFile(backupPath);
      await writePersistedChatSnapshot(this.filePath, recovered);
      reportStoreDiagnostic('recover_from_backup', {
        filePath: this.filePath,
        backupPath,
        setupCompleteAt: recovered.setupCompleteAt,
        ownerDisplayName: recovered.ownerProfile.displayName,
      });
      return this.cacheSnapshot(recovered);
    } catch (error) {
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
      if (isErrnoException(error) && error.code === 'ENOENT') {
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

  private async readPersistedSnapshot(): Promise<PersistedChatSnapshot> {
    await this.mutationQueue;
    return this.readPersistedSnapshotUnsafe();
  }

  async read(): Promise<ChatState> {
    return structuredClone((await this.readPersistedSnapshot()).chat);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(extractCoreState(await this.readPersistedSnapshot()));
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    return this.runExclusive(async () => {
      const persisted = await this.writeSnapshotUnsafe(chat, core);
      this.emitCoreChange(extractCoreState(persisted));
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
      const currentChat = (await this.readPersistedSnapshotUnsafe()).chat;
      const persisted = await this.writeSnapshotUnsafe(currentChat, state);
      return this.emitCoreChange(extractCoreState(persisted));
    });
  }

  async updateCore(mutator: CoreStateMutator): Promise<CatsCoreState> {
    return this.runExclusive(async () => {
      const current = await this.readPersistedSnapshotUnsafe();
      const nextCore = await mutator(structuredClone(extractCoreState(current)));
      const persisted = await this.writeSnapshotUnsafe(current.chat, nextCore);
      return this.emitCoreChange(extractCoreState(persisted));
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
  private chatState: ChatState;
  private coreState: CatsCoreState;
  private readonly coreListeners = new Set<CoreStoreListener>();

  constructor(
    initialState: ChatState | CatsCoreState | PersistedChatSnapshot = createDefaultChatState(),
  ) {
    const snapshot = repairPersistedSetupCompletion(normalizePersistedChatSnapshot(initialState));
    this.chatState = snapshot.chat;
    this.coreState = extractCoreState(snapshot);
  }

  async read(): Promise<ChatState> {
    return structuredClone(this.chatState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.coreState);
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    const snapshot = this.applySnapshotState(chat, core);
    this.emitCoreChange();
    return structuredClone(snapshot);
  }

  async write(state: ChatState): Promise<ChatState> {
    const previousCore = structuredClone(this.coreState);
    this.applySnapshotState(state, previousCore);
    if (hasSubstantiveCoreChange(previousCore, this.coreState)) {
      this.emitCoreChange();
    }
    return structuredClone(this.chatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    await this.writeSnapshot(this.chatState, state);
    return structuredClone(this.coreState);
  }

  async updateCore(mutator: CoreStateMutator): Promise<CatsCoreState> {
    const nextCore = await mutator(structuredClone(this.coreState));
    await this.writeSnapshot(this.chatState, nextCore);
    return structuredClone(this.coreState);
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
    this.chatState = structuredClone(chat);
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(core));
    return buildPersistedChatSnapshot(this.chatState, this.coreState);
  }
}
