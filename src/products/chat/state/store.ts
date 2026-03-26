import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChatState } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
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

export interface ChatStore extends CoreStore {
  read(): Promise<ChatState>;
  write(state: ChatState): Promise<ChatState>;
  writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot>;
}

async function writePersistedChatSnapshot(
  filePath: string,
  snapshot: PersistedChatSnapshot,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
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
  constructor(private readonly filePath: string) {}

  private async readPersistedSnapshot(): Promise<PersistedChatSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const normalized = normalizePersistedChatSnapshot(JSON.parse(raw) as unknown);
      const repaired = repairPersistedSetupCompletion(normalized);
      if (repaired.setupCompleteAt !== normalized.setupCompleteAt) {
        await writePersistedChatSnapshot(this.filePath, repaired);
      }
      return repaired;
    } catch {
      const chat = createDefaultChatState();
      const core = syncCoreStateWithChatState(chat, createDefaultCoreState());
      const snapshot = buildPersistedChatSnapshot(chat, core);
      await writePersistedChatSnapshot(this.filePath, snapshot);
      return snapshot;
    }
  }

  async read(): Promise<ChatState> {
    return structuredClone((await this.readPersistedSnapshot()).chat);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(extractCoreState(await this.readPersistedSnapshot()));
  }

  async writeSnapshot(chat: ChatState, core: CatsCoreState): Promise<PersistedChatSnapshot> {
    const nextChatState = structuredClone(chat);
    const nextCore = syncCoreStateWithChatState(nextChatState, structuredClone(core));
    const snapshot = buildPersistedChatSnapshot(nextChatState, nextCore);
    await writePersistedChatSnapshot(this.filePath, snapshot);
    return structuredClone(snapshot);
  }

  async write(state: ChatState): Promise<ChatState> {
    const nextChatState = structuredClone(state);
    await this.writeSnapshot(nextChatState, await this.readCore());
    return structuredClone(nextChatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    const snapshot = await this.readPersistedSnapshot();
    const persisted = await this.writeSnapshot(snapshot.chat, state);
    return structuredClone(extractCoreState(persisted));
  }
}

export class MemoryChatStore implements ChatStore {
  private chatState: ChatState;
  private coreState: CatsCoreState;

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
    this.chatState = structuredClone(chat);
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(core));
    const snapshot = buildPersistedChatSnapshot(this.chatState, this.coreState);
    return structuredClone(snapshot);
  }

  async write(state: ChatState): Promise<ChatState> {
    await this.writeSnapshot(state, this.coreState);
    return structuredClone(this.chatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    await this.writeSnapshot(this.chatState, state);
    return structuredClone(this.coreState);
  }
}
