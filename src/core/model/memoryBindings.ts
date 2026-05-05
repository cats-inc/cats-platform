import { randomUUID } from 'node:crypto';

import { CoreNotFoundError } from '../errors.js';
import { createCatActorId, GLOBAL_ORCHESTRATOR_ACTOR_ID } from '../actors.js';
import { touchCoreState } from './shared.js';
import type {
  BotBindingRecord,
  CatsCoreState,
  DurableMemoryCategory,
  DurableMemoryRecord,
  DurableMemorySubjectType,
} from '../types.js';

export interface DurableMemoryListQuery {
  ids?: string[];
  categories?: DurableMemoryCategory[];
  sourceRefs?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
}

export function addDurableMemory(
  core: CatsCoreState,
  record: DurableMemoryRecord,
): CatsCoreState {
  return touchCoreState(
    {
      ...core,
      durableMemory: [...core.durableMemory, structuredClone(record)],
    },
    record.updatedAt,
  );
}

export function updateDurableMemory(
  core: CatsCoreState,
  recordId: string,
  updates: Partial<Pick<DurableMemoryRecord, 'content' | 'confidence' | 'category' | 'sourceRefs'>>,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const index = core.durableMemory.findIndex((record) => record.id === recordId);
  if (index === -1) {
    throw new CoreNotFoundError(
      `Durable memory not found: ${recordId}`,
      'durable_memory_not_found',
    );
  }

  const nextMemory = structuredClone(core.durableMemory);
  nextMemory[index] = {
    ...nextMemory[index],
    ...updates,
    updatedAt: nowIso,
  };

  return touchCoreState(
    {
      ...core,
      durableMemory: nextMemory,
    },
    nowIso,
  );
}

export function removeDurableMemory(
  core: CatsCoreState,
  recordId: string,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const nextMemory = core.durableMemory.filter((record) => record.id !== recordId);

  if (nextMemory.length === core.durableMemory.length) {
    throw new CoreNotFoundError(
      `Durable memory not found: ${recordId}`,
      'durable_memory_not_found',
    );
  }

  return touchCoreState(
    {
      ...core,
      durableMemory: nextMemory,
    },
    nowIso,
  );
}

export function listDurableMemoryBySubject(
  core: CatsCoreState,
  subjectType: DurableMemorySubjectType,
  subjectId: string,
  query: DurableMemoryListQuery = {},
): DurableMemoryRecord[] {
  return core.durableMemory
    .filter((record) => record.subjectType === subjectType && record.subjectId === subjectId)
    .filter((record) => {
      if (query.ids && !query.ids.includes(record.id)) {
        return false;
      }
      if (query.categories && !query.categories.includes(record.category)) {
        return false;
      }
      if (
        query.sourceRefs
        && !record.sourceRefs.some((sourceRef) => query.sourceRefs?.includes(sourceRef))
      ) {
        return false;
      }
      if (
        query.minConfidence !== undefined
        && (record.confidence === null || record.confidence < query.minConfidence)
      ) {
        return false;
      }
      if (
        query.maxConfidence !== undefined
        && (record.confidence === null || record.confidence > query.maxConfidence)
      ) {
        return false;
      }
      return true;
    })
    .slice(0, query.limit);
}

export function createBotBinding(
  core: CatsCoreState,
  input: {
    platform: 'telegram' | 'line';
    botName: string;
    catId: string;
    roomMode?: 'chat_channel' | 'direct_message';
  },
  now: Date = new Date(),
): { core: CatsCoreState; binding: BotBindingRecord } {
  const nowIso = now.toISOString();
  const binding: BotBindingRecord = {
    id: `bot-binding-${randomUUID()}`,
    platform: input.platform,
    botName: input.botName.trim(),
    orchestratorActorId: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    catActorId: createCatActorId(input.catId),
    bossCatActorId: null,
    botToken: null,
    webhookSecret: null,
    inboundMode: 'polling',
    roomMode: input.roomMode ?? 'direct_message',
    status: 'active',
    outboundFanoutEnabled: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    core: touchCoreState(
      {
        ...core,
        botBindings: [...core.botBindings, binding],
      },
      nowIso,
    ),
    binding,
  };
}

export function removeBotBinding(
  core: CatsCoreState,
  bindingId: string,
  now: Date = new Date(),
): CatsCoreState {
  const nowIso = now.toISOString();
  const next = core.botBindings.filter((binding) => binding.id !== bindingId);
  if (next.length === core.botBindings.length) {
    throw new CoreNotFoundError(
      `Bot binding not found: ${bindingId}`,
      'bot_binding_not_found',
    );
  }
  return touchCoreState({ ...core, botBindings: next }, nowIso);
}
