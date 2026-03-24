import {
  createCatActorId,
  listDurableMemoryBySubject,
} from '../../core/model.js';
import type { CanonicalMemoryStore } from './store.js';
import type {
  CanonicalMemoryOriginKind,
  MemoryCatRef,
  MemoryChannelContext,
  MemoryChannelSnapshot,
  MemoryChatSurface,
  MemoryCompanionSurface,
  CanonicalMemoryRecord,
  MemoryFlushReason,
  MemoryFlushPayload,
  MemoryFlushResult,
  MemoryRetrievalContext,
} from './contracts.js';
import {
  extractCanonicalMemoryFromChannel,
  extractCanonicalMemoryFromCompanionBox,
  extractCanonicalMemoryFromDurableMemory,
  extractCanonicalMemoryFromOwnerProfile,
} from './extraction.js';
import { buildMemoryRetrievalContext } from './retrieval.js';

const COMPANION_BOX_ORIGIN_KINDS: CanonicalMemoryOriginKind[] = [
  'companion_source',
  'companion_derived',
  'companion_memory',
  'response_profile',
  'durable_memory',
];

const CHANNEL_ORIGIN_KINDS: CanonicalMemoryOriginKind[] = ['channel_working_memory'];

const OWNER_ORIGIN_KINDS: CanonicalMemoryOriginKind[] = ['owner_profile', 'durable_memory'];

export interface CatsMemoryService {
  listCanonicalRecords(filter?: {
    subjectKind?: CanonicalMemoryRecord['subjectKind'];
    subjectId?: string;
  }): Promise<CanonicalMemoryRecord[]>;
  flushCompanionBox(input: {
    catId: string;
    companionStore: MemoryCompanionSurface;
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
    cat: MemoryCatRef;
    channel: MemoryChannelContext;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore: MemoryCompanionSurface;
    now?: Date;
  }): Promise<MemoryRetrievalContext>;
  buildChannelRetrievalContext(input: {
    channelId: string;
    catId?: string | null;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore?: MemoryCompanionSurface;
    now?: Date;
  }): Promise<MemoryRetrievalContext>;
}

function buildFlushPayload(input: {
  scope: CanonicalMemoryRecord['subjectKind'];
  subjectId: string;
  reason: MemoryFlushReason;
  generatedAt: string;
  records: CanonicalMemoryRecord[];
  removedRecordIds: string[];
}): MemoryFlushPayload {
  return {
    version: 1,
    reason: input.reason,
    generatedAt: input.generatedAt,
    subject: {
      kind: input.scope,
      id: input.subjectId,
    },
    replacementMode: 'subject_projection_replace',
    sourceScopeKeys: Array.from(new Set(
      input.records.flatMap((record) => record.lineage.sourceScopeKeys),
    )),
    persistedRecords: input.records.map((record) => ({
      recordId: record.id,
      category: record.category,
      originKind: record.origin.kind,
      promotionRule: record.promotionRule,
      visibility: record.visibility,
      sourceRefs: structuredClone(record.sourceRefs),
      sourceScopeKeys: structuredClone(record.lineage.sourceScopeKeys),
      replacementGroup: record.lineage.replacementGroup,
    })),
    removedRecordIds: structuredClone(input.removedRecordIds),
  };
}

export class DefaultCatsMemoryService implements CatsMemoryService {
  constructor(
    private readonly chatSurface: MemoryChatSurface,
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
    companionStore: MemoryCompanionSurface;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'manual';
    const [core, box, sources, derived, memory, responseProfile] = await Promise.all([
      this.chatSurface.readCore(),
      input.companionStore.getBox(input.catId, now),
      input.companionStore.listSources(input.catId, now),
      input.companionStore.listDerived(input.catId, now),
      input.companionStore.listMemory(input.catId, now),
      input.companionStore.getResponseProfile(input.catId, now),
    ]);
    const durableMemory = listDurableMemoryBySubject(
      core,
      'cat',
      createCatActorId(input.catId),
    );
    const { persisted, removedRecordIds } = await this.memoryStore.replaceRecordsWithResult(
      {
        subjectKind: 'cat',
        subjectId: input.catId,
        originKinds: COMPANION_BOX_ORIGIN_KINDS,
      },
      [
        ...extractCanonicalMemoryFromCompanionBox({
          catId: input.catId,
          box,
          sources,
          derived,
          memory,
          responseProfile,
          reason,
          now,
        }),
        ...extractCanonicalMemoryFromDurableMemory({
          subjectKind: 'cat',
          subjectId: input.catId,
          records: durableMemory,
          reason,
          now,
        }),
      ],
      now,
    );
    const generatedAt = now.toISOString();
    const payload = buildFlushPayload({
      scope: 'cat',
      subjectId: input.catId,
      reason,
      generatedAt,
      records: persisted,
      removedRecordIds,
    });

    return {
      scope: 'cat',
      subjectId: input.catId,
      reason,
      generatedAt,
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
      removedRecordIds,
      payload,
    };
  }

  async flushChannel(input: {
    channelId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'manual';
    const channel = await this.chatSurface.readChannel(input.channelId);
    const { persisted, removedRecordIds } = await this.memoryStore.replaceRecordsWithResult(
      {
        subjectKind: 'channel',
        subjectId: input.channelId,
        originKinds: CHANNEL_ORIGIN_KINDS,
      },
      extractCanonicalMemoryFromChannel({
        channel,
        reason,
        now,
      }),
      now,
    );
    const generatedAt = now.toISOString();
    const payload = buildFlushPayload({
      scope: 'channel',
      subjectId: input.channelId,
      reason,
      generatedAt,
      records: persisted,
      removedRecordIds,
    });

    return {
      scope: 'channel',
      subjectId: input.channelId,
      reason,
      generatedAt,
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
      removedRecordIds,
      payload,
    };
  }

  async flushOwnerProfile(input?: {
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input?.now ?? new Date();
    const reason = input?.reason ?? 'owner_profile_sync';
    const core = await this.chatSurface.readCore();
    const durableMemory = listDurableMemoryBySubject(
      core,
      'owner',
      core.ownerProfile.actorId,
    );
    const { persisted, removedRecordIds } = await this.memoryStore.replaceRecordsWithResult(
      {
        subjectKind: 'owner',
        subjectId: core.ownerProfile.actorId,
        originKinds: OWNER_ORIGIN_KINDS,
      },
      [
        ...extractCanonicalMemoryFromOwnerProfile({
          ownerProfile: core.ownerProfile,
          reason,
          now,
        }),
        ...extractCanonicalMemoryFromDurableMemory({
          subjectKind: 'owner',
          subjectId: core.ownerProfile.actorId,
          records: durableMemory,
          reason,
          now,
        }),
      ],
      now,
    );
    const generatedAt = now.toISOString();
    const payload = buildFlushPayload({
      scope: 'owner',
      subjectId: core.ownerProfile.actorId,
      reason,
      generatedAt,
      records: persisted,
      removedRecordIds,
    });

    return {
      scope: 'owner',
      subjectId: core.ownerProfile.actorId,
      reason,
      generatedAt,
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
      removedRecordIds,
      payload,
    };
  }

  async buildCompanionRetrievalContext(input: {
    cat: MemoryCatRef;
    channel: MemoryChannelContext;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore: MemoryCompanionSurface;
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    const now = input.now ?? new Date();
    const core = await this.chatSurface.readCore();
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
      roomMode: input.channel.roomRouting?.mode ?? null,
      transport: input.transport ?? null,
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
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore?: MemoryCompanionSurface;
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    const now = input.now ?? new Date();
    const channel = await this.chatSurface.readChannel(input.channelId);
    const cat = input.catId ? await this.chatSurface.findCat(input.catId) : null;

    if (cat && input.companionStore) {
      return this.buildCompanionRetrievalContext({
        cat,
        channel: {
          id: channel.id,
          title: channel.title,
          topic: channel.topic,
          workingMemory: channel.workingMemory,
          roomRouting: channel.roomRouting,
        },
        transport: input.transport ?? null,
        companionStore: input.companionStore,
        now,
      });
    }

    const core = await this.chatSurface.readCore();
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
      roomMode: channel.roomRouting?.mode ?? null,
      transport: input.transport ?? null,
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
  chatSurface: MemoryChatSurface,
  memoryStore: CanonicalMemoryStore,
): CatsMemoryService {
  return new DefaultCatsMemoryService(chatSurface, memoryStore);
}
