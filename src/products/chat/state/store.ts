import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ChatState } from '../api/contracts.js';
import type { CatsCoreState } from '../../../core/types.js';
import type { CoreStore } from '../../../core/store.js';
import { createDefaultChatState } from './defaults.js';
import { createDefaultCoreState } from '../../../core/model.js';
import { syncCoreStateWithChatState } from './coreProjection.js';
import { normalizePersistedChatSnapshot } from './chatSnapshot.js';
import type { PersistedChatSnapshot } from './coreSnapshot.js';
import {
  buildPersistedChatSnapshot,
  extractCoreState,
} from './coreSnapshot.js';

export interface ChatStore extends CoreStore {
  read(): Promise<ChatState>;
  write(state: ChatState): Promise<ChatState>;
}

async function writePersistedChatSnapshot(
  filePath: string,
  snapshot: PersistedChatSnapshot,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');
}

export class FileChatStore implements ChatStore {
  constructor(private readonly filePath: string) {}

  private async readPersistedSnapshot(): Promise<PersistedChatSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      return normalizePersistedChatSnapshot(JSON.parse(raw) as unknown);
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

  async write(state: ChatState): Promise<ChatState> {
    const nextChatState = structuredClone(state);
    const nextCore = syncCoreStateWithChatState(nextChatState, await this.readCore());
    await writePersistedChatSnapshot(
      this.filePath,
      buildPersistedChatSnapshot(nextChatState, nextCore),
    );
    return structuredClone(nextChatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    const snapshot = await this.readPersistedSnapshot();
    const nextChatState = structuredClone(snapshot.chat);
    const nextCore = syncCoreStateWithChatState(nextChatState, structuredClone(state));
    await writePersistedChatSnapshot(
      this.filePath,
      buildPersistedChatSnapshot(nextChatState, nextCore),
    );
    return structuredClone(nextCore);
  }
}

export class MemoryChatStore implements ChatStore {
  private chatState: ChatState;
  private coreState: CatsCoreState;

  constructor(
    initialState: ChatState | CatsCoreState | PersistedChatSnapshot = createDefaultChatState(),
  ) {
    const snapshot = normalizePersistedChatSnapshot(initialState);
    this.chatState = snapshot.chat;
    this.coreState = extractCoreState(snapshot);
  }

  async read(): Promise<ChatState> {
    return structuredClone(this.chatState);
  }

  async readCore(): Promise<CatsCoreState> {
    return structuredClone(this.coreState);
  }

  async write(state: ChatState): Promise<ChatState> {
    this.chatState = structuredClone(state);
    this.coreState = syncCoreStateWithChatState(this.chatState, this.coreState);
    return structuredClone(this.chatState);
  }

  async writeCore(state: CatsCoreState): Promise<CatsCoreState> {
    this.coreState = syncCoreStateWithChatState(this.chatState, structuredClone(state));
    return structuredClone(this.coreState);
  }
}
