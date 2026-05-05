import {
  listDurableMemoryBySubject,
} from '../../core/model/index.js';
import { createCatActorId } from '../../core/actors.js';
import type { CanonicalMemoryStore } from './store.js';
import type {
  CanonicalMemoryOriginKind,
  MemoryCatRef,
  MemoryChannelContext,
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
const DURABLE_ONLY_ORIGIN_KINDS: CanonicalMemoryOriginKind[] = ['durable_memory'];

function readNonEmptyString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = readNonEmptyString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

async function listScopedCanonicalRecords(
  memoryStore: CanonicalMemoryStore,
  subjectKind: CanonicalMemoryRecord['subjectKind'],
  subjectIds: string[],
): Promise<CanonicalMemoryRecord[]> {
  const recordGroups = await Promise.all(
    subjectIds.map((subjectId) => memoryStore.listRecords({ subjectKind, subjectId })),
  );
  return recordGroups.flatMap((records) => records);
}

export interface BuildMemoryRetrievalContextInput {
  catId?: string | null;
  channelId?: string | null;
  channelTitle?: string;
  channelTopic?: string;
  workingMemory?: MemoryChannelContext['workingMemory'];
  roomMode?: 'chat_channel' | 'direct_message' | null;
  transport?: 'telegram' | 'line' | 'web' | null;
  includeOwnerProfile?: boolean;
  companionStore?: MemoryCompanionSurface;
  relationshipIds?: string[];
  projectIds?: string[];
  queryHints?: string[];
  now?: Date;
}

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
  flushProject(input: {
    projectId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult>;
  flushRelationship(input: {
    relationshipId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult>;
  buildRetrievalContext(input: BuildMemoryRetrievalContextInput): Promise<MemoryRetrievalContext>;
  buildCompanionRetrievalContext(input: {
    cat: MemoryCatRef;
    channel: MemoryChannelContext;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore: MemoryCompanionSurface;
    relationshipIds?: string[];
    projectIds?: string[];
    queryHints?: string[];
    now?: Date;
  }): Promise<MemoryRetrievalContext>;
  buildChannelRetrievalContext(input: {
    channelId: string;
    catId?: string | null;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore?: MemoryCompanionSurface;
    relationshipIds?: string[];
    projectIds?: string[];
    queryHints?: string[];
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

  private async flushDurableSubject(input: {
    subjectKind: 'project' | 'relationship';
    subjectId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    const now = input.now ?? new Date();
    const reason = input.reason ?? 'manual';
    const core = await this.chatSurface.readCore();
    const durableMemory = listDurableMemoryBySubject(core, input.subjectKind, input.subjectId);
    const { persisted, removedRecordIds } = await this.memoryStore.replaceRecordsWithResult(
      {
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        originKinds: DURABLE_ONLY_ORIGIN_KINDS,
      },
      extractCanonicalMemoryFromDurableMemory({
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        records: durableMemory,
        reason,
        now,
      }),
      now,
    );
    const generatedAt = now.toISOString();
    const payload = buildFlushPayload({
      scope: input.subjectKind,
      subjectId: input.subjectId,
      reason,
      generatedAt,
      records: persisted,
      removedRecordIds,
    });

    return {
      scope: input.subjectKind,
      subjectId: input.subjectId,
      reason,
      generatedAt,
      persistedCount: persisted.length,
      persistedRecordIds: persisted.map((record) => record.id),
      removedRecordIds,
      payload,
    };
  }

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

  async flushProject(input: {
    projectId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    return this.flushDurableSubject({
      subjectKind: 'project',
      subjectId: input.projectId,
      reason: input.reason,
      now: input.now,
    });
  }

  async flushRelationship(input: {
    relationshipId: string;
    reason?: MemoryFlushReason;
    now?: Date;
  }): Promise<MemoryFlushResult> {
    return this.flushDurableSubject({
      subjectKind: 'relationship',
      subjectId: input.relationshipId,
      reason: input.reason,
      now: input.now,
    });
  }

  async buildRetrievalContext(
    input: BuildMemoryRetrievalContextInput,
  ): Promise<MemoryRetrievalContext> {
    const now = input.now ?? new Date();
    const core = await this.chatSurface.readCore();
    const normalizedCatId = readNonEmptyString(input.catId);
    const normalizedChannelId = readNonEmptyString(input.channelId);
    const relationshipIds = uniqueNonEmptyStrings(input.relationshipIds ?? []);
    const projectIds = uniqueNonEmptyStrings(input.projectIds ?? []);
    const shouldReadChannel = Boolean(
      normalizedChannelId
      && (
        input.channelTitle === undefined
        || input.channelTopic === undefined
        || input.workingMemory === undefined
        || input.roomMode === undefined
      ),
    );
    const channel = shouldReadChannel && normalizedChannelId
      ? await this.chatSurface.readChannel(normalizedChannelId)
      : null;
    const [companionSources, companionDerived, companionMemory, catRecords, ownerRecords, channelRecords, relationshipRecords, projectRecords] = await Promise.all([
      input.companionStore && normalizedCatId
        ? input.companionStore.listSources(normalizedCatId, now)
        : Promise.resolve([]),
      input.companionStore && normalizedCatId
        ? input.companionStore.listDerived(normalizedCatId, now)
        : Promise.resolve([]),
      input.companionStore && normalizedCatId
        ? input.companionStore.listMemory(normalizedCatId, now)
        : Promise.resolve([]),
      normalizedCatId
        ? this.memoryStore.listRecords({ subjectKind: 'cat', subjectId: normalizedCatId })
        : Promise.resolve([]),
      this.memoryStore.listRecords({ subjectKind: 'owner', subjectId: core.ownerProfile.actorId }),
      normalizedChannelId
        ? this.memoryStore.listRecords({ subjectKind: 'channel', subjectId: normalizedChannelId })
        : Promise.resolve([]),
      listScopedCanonicalRecords(this.memoryStore, 'relationship', relationshipIds),
      listScopedCanonicalRecords(this.memoryStore, 'project', projectIds),
    ]);
    const projectHints = uniqueNonEmptyStrings(
      core.projects
        .filter((project) => projectIds.includes(project.id))
        .flatMap((project) => [project.title, project.summary]),
    );

    const context = buildMemoryRetrievalContext({
      now,
      catId: normalizedCatId,
      channelId: normalizedChannelId,
      includeOwnerProfile: input.includeOwnerProfile,
      channelTitle: readNonEmptyString(input.channelTitle) ?? channel?.title,
      channelTopic: readNonEmptyString(input.channelTopic) ?? channel?.topic,
      workingMemory: input.workingMemory ?? channel?.workingMemory,
      roomMode: input.roomMode ?? channel?.roomRouting?.mode ?? null,
      transport: input.transport ?? null,
      relationshipIds,
      projectIds,
      queryHints: [...(input.queryHints ?? []), ...projectHints],
      canonicalRecords: [
        ...catRecords,
        ...ownerRecords,
        ...channelRecords,
        ...relationshipRecords,
        ...projectRecords,
      ],
      companionSources,
      companionDerived,
      companionMemory,
    });
    await this.memoryStore.touchRecords(
      context.hits
        .map((hit) => hit.recordId)
        .filter((recordId) => recordId.startsWith('cats-memory-')),
      now,
    );

    return context;
  }

  async buildCompanionRetrievalContext(input: {
    cat: MemoryCatRef;
    channel: MemoryChannelContext;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore: MemoryCompanionSurface;
    relationshipIds?: string[];
    projectIds?: string[];
    queryHints?: string[];
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    return this.buildRetrievalContext({
      catId: input.cat.id,
      channelId: input.channel.id,
      channelTitle: input.channel.title,
      channelTopic: input.channel.topic,
      workingMemory: input.channel.workingMemory,
      roomMode: input.channel.roomRouting?.mode ?? null,
      transport: input.transport ?? null,
      companionStore: input.companionStore,
      relationshipIds: input.relationshipIds,
      projectIds: input.projectIds,
      queryHints: input.queryHints,
      now: input.now,
    });
  }

  async buildChannelRetrievalContext(input: {
    channelId: string;
    catId?: string | null;
    transport?: 'telegram' | 'line' | 'web' | null;
    companionStore?: MemoryCompanionSurface;
    relationshipIds?: string[];
    projectIds?: string[];
    queryHints?: string[];
    now?: Date;
  }): Promise<MemoryRetrievalContext> {
    return this.buildRetrievalContext({
      catId: input.catId,
      channelId: input.channelId,
      transport: input.transport ?? null,
      companionStore: input.companionStore,
      relationshipIds: input.relationshipIds,
      projectIds: input.projectIds,
      queryHints: input.queryHints,
      now: input.now,
    });
  }
}

export function createCatsMemoryService(
  chatSurface: MemoryChatSurface,
  memoryStore: CanonicalMemoryStore,
): CatsMemoryService {
  return new DefaultCatsMemoryService(chatSurface, memoryStore);
}
