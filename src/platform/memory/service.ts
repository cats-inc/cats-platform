import type { MemoryCheckpointSummary } from '../../core/types.js';
import type {
  ChatCat,
  ChatChannelView,
} from '../../shared/app-shell.js';
import { requireChannel } from '../../products/chat/state/model.js';
import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import type { CanonicalMemoryStore } from './store.js';
import type {
  CanonicalMemoryRecord,
  MemoryFlushReason,
  MemoryFlushResult,
  MemoryRetrievalContext,
} from './contracts.js';
import {
  extractCanonicalMemoryFromChannel,
  extractCanonicalMemoryFromCompanionBox,
  extractCanonicalMemoryFromOwnerProfile,
} from './extraction.js';
import { buildMemoryRetrievalContext } from './retrieval.js';

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.trim() ?? '')
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
}

export interface CatsMemoryService {
  listCanonicalRecords(filter?: {
    subjectKind?: CanonicalMemoryRecord['subjectKind'];
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]>;
  flushCompanionBox(input: {
    catId: string;
    companionStore: CompanionBoxStore;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult>;
  flushChannel(input: {
    channelId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult>;
  flushOwnerProfile(input?: {
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult>;
  buildCompanionRetrievalContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: MemoryCheckpointSummary;
      roomRouting?: ChatChannelView['roomRouting'];
    };
    companionStore: CompanionBoxStore;
    now?: Date;
  }): Promise<MemoryRetrievalContext>;
  buildChannelRetrievalContext(input: {
    channelId: string;
    catId?: string | null;
    companionStore?: CompanionBoxStore;
    now?: Date;
  }): Promise<MemoryRetrievalContext>;
}

export class DefaultCatsMemoryService implements CatsMemoryService {
  constructor(
    private readonly chatStore: ChatStore,
    private readonly memoryStore: CanonicalMemoryStore,
  ) {}

  async listCanonicalRecords(filter?: {
    subjectKind?: CanonicalMemoryRecord['subjectKind'];
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]> {
    return this.memoryStore.listRecords(filter);
  }

  async flushCompanionBox(input: {
    catId: string;
    companionStore: CompanionBoxStore;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'manual';
    const [box, sources, derived, memory, responseProfile] = await Promise.all([
      input.companionStore.getBox(input.catId, now),
      input.companionStore.listSources(input.catId, now),
      input.companionStore.listDerived(input.catId, now),
      input.companionStore.listMemory(input.catId, now),
      input.companionStore.getResponseProfile(input.catId, now),
    ]);
    const persisted = await this.memoryStore.upsertRecords(
      extractCanonicalMemoryFromCompanionBox({
        catId: input.catId,
        box,
        sources,
        derived,
        memory,
        responseProfile,
        reason,
        now,
      }),
      now,
    );

    return {
      scope: 'cat',
      subjectId: input.catId,
      reason,
      generatedAt: now.toISOString(),
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
    };
  }

  async flushChannel(input: {
    channelId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'manual';
    const state = await this.chatStore.read();
    const channel = requireChannel(state, input.channelId);
    const persisted = await this.memoryStore.upsertRecords(
      extractCanonicalMemoryFromChannel({
        channel,
        reason,
        now,
      }),
      now,
    );

    return {
      scope: 'channel',
      subjectId: input.channelId,
      reason,
      generatedAt: now.toISOString(),
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
    };
  }

  async flushOwnerProfile(input?: {
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input?.now ?? new Date();
    const reason = input?.reason ?? 'owner_profile_sync';
    const core = await this.chatStore.readCore();
    const persisted = await this.memoryStore.upsertRecords(
      extractCanonicalMemoryFromOwnerProfile({
        ownerProfile: core.ownerProfile,
        reason,
        now,
      }),
      now,
    );

    return {
      scope: 'owner',
      subjectId: core.ownerProfile.actorId,
      reason,
      generatedAt: now.toISOString(),
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
    };
  }

  async buildCompanionRetrievalContext(input: {
    cat: ChatCat;
    channel: {
      id: string | null;
      title: string;
      topic: string;
      workingMemory?: MemoryCheckpointSummary;
      roomRouting?: ChatChannelView['roomRouting'];
    };
    companionStore: CompanionBoxStore;
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    const now = input.now ?? new Date();
    const core = await this.chatStore.readCore();
    const [sources, derived, memory, catRecords, ownerRecords, channelRecords] = await Promise.all([
      input.companionStore.listSources(input.cat.id, now),
      input.companionStore.listDerived(input.cat.id, now),
      input.companionStore.listMemory(input.cat.id, now),
      this.memoryStore.listRecords({ subjectKind: 'cat', subjectId: input.cat.id }),
      this.memoryStore.listRecords({ subjectKind: 'owner', subjectId: core.ownerProfile.actorId }),
      input.channel.id
        ? this.memoryStore.listRecords({ subjectKind: 'channel', subjectId: input.channel.id })
        : Promise.resolve([]),
    ]);

    const context = buildMemoryRetrievalContext({
      now,
      catId: input.cat.id,
      channelId: input.channel.id,
      includeOwnerProfile: true,
      channelTitle: input.channel.title,
      channelTopic: input.channel.topic,
      workingMemory: input.channel.workingMemory,
      canonicalRecords: [...catRecords, ...ownerRecords, ...channelRecords],
      companionSources: sources,
      companionDerived: derived,
      companionMemory: memory,
    });

    await this.memoryStore.touchRecords(
      context.hits
        .map((hit) => hit.recordId)
        .filter((recordId) => recordId.startsWith('cats-memory-')),
      now,
    );

    return context;
  }

  async buildChannelRetrievalContext(input: {
    channelId: string;
    catId?: string | null;
    companionStore?: CompanionBoxStore;
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    const now = input.now ?? new Date();
    const state = await this.chatStore.read();
    const channel = requireChannel(state, input.channelId);
    const channelView: ChatChannelView = {
      ...structuredClone(channel),
      assignedCats: channel.catAssignments
        .filter((assignment) => assignment.status === 'active')
        .map((assignment) => {
          const cat = state.cats.find((candidate) => candidate.id === assignment.catId);
          return cat
            ? {
                catId: cat.id,
                name: cat.name,
                roles: structuredClone(cat.roles),
                skillProfile: cat.skillProfile,
                mcpProfile: cat.mcpProfile,
                status: assignment.status,
                joinedAt: assignment.joinedAt,
                leftAt: assignment.leftAt,
                avatarColor: cat.avatarColor,
                execution: structuredClone(assignment.execution),
                memory: structuredClone(cat.memory),
              }
            : null;
        })
        .filter((cat): cat is ChatChannelView['assignedCats'][number] => cat !== null),
    };
    const cat = input.catId
      ? state.cats.find((candidate) => candidate.id === input.catId) ?? null
      : null;

    if (cat && input.companionStore) {
      return this.buildCompanionRetrievalContext({
        cat,
        channel: {
          id: channelView.id,
          title: channelView.title,
          topic: channelView.topic,
          workingMemory: channelView.workingMemory,
          roomRouting: channelView.roomRouting,
        },
        companionStore: input.companionStore,
        now,
      });
    }

    const core = await this.chatStore.readCore();
    const [channelRecords, ownerRecords] = await Promise.all([
      this.memoryStore.listRecords({ subjectKind: 'channel', subjectId: channel.id }),
      this.memoryStore.listRecords({ subjectKind: 'owner', subjectId: core.ownerProfile.actorId }),
    ]);

    const context = buildMemoryRetrievalContext({
      now,
      catId: cat?.id ?? null,
      channelId: channel.id,
      includeOwnerProfile: true,
      channelTitle: channel.title,
      channelTopic: channel.topic,
      workingMemory: channel.workingMemory,
      canonicalRecords: [...channelRecords, ...ownerRecords],
    });
    await this.memoryStore.touchRecords(
      context.hits
        .map((hit) => hit.recordId)
        .filter((recordId) => recordId.startsWith('cats-memory-')),
      now,
    );
    return context;
  }
}

export function createCatsMemoryService(
  chatStore: ChatStore,
  memoryStore: CanonicalMemoryStore,
): CatsMemoryService {
  return new DefaultCatsMemoryService(chatStore, memoryStore);
}
