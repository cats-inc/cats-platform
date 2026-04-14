import { randomUUID } from 'node:crypto';

import { createEmptyMemoryCheckpoint } from '../actors.js';
import type { CoreActorWriteInput } from './inputs.js';
import {
  normalizeNullableString,
  normalizeStringArray,
  replaceById,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
} from '../types.js';

function normalizeExecutionTarget(
  input: CoreActorWriteInput['defaultExecutionTarget'],
  existing: ExecutionTargetSummary | null,
): ExecutionTargetSummary | null {
  if (input === undefined) {
    return existing ? structuredClone(existing) : null;
  }
  if (input === null) {
    return null;
  }

  return {
    provider: normalizeNullableString(input.provider) ?? existing?.provider ?? 'claude',
    instance:
      input.instance === undefined
        ? existing?.instance ?? null
        : normalizeNullableString(input.instance),
    model:
      input.model === undefined
        ? existing?.model ?? null
        : normalizeNullableString(input.model),
  };
}

function normalizeMemoryCheckpoint(
  input: CoreActorWriteInput['memory'],
  existing: MemoryCheckpointSummary | null,
): MemoryCheckpointSummary {
  if (input === undefined) {
    return existing ? structuredClone(existing) : createEmptyMemoryCheckpoint();
  }
  if (input === null) {
    return createEmptyMemoryCheckpoint();
  }

  return {
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    facts:
      input.facts === undefined
        ? normalizeStringArray(existing?.facts)
        : normalizeStringArray(input.facts),
    openLoops:
      input.openLoops === undefined
        ? normalizeStringArray(existing?.openLoops)
        : normalizeStringArray(input.openLoops),
    updatedAt:
      input.updatedAt === undefined
        ? existing?.updatedAt ?? null
        : normalizeNullableString(input.updatedAt),
  };
}

export function upsertCoreActor(
  core: CatsCoreState,
  input: CoreActorWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; actor: CoreActorRecord; created: boolean } {
  const nowIso = now.toISOString();
  const name = input.name.trim();
  const actorId = normalizeNullableString(input.id) ?? `actor-${randomUUID()}`;
  const existing = core.actors.find((actor) => actor.id === actorId);

  const actor: CoreActorRecord = {
    id: actorId,
    name,
    kind: input.kind ?? existing?.kind ?? 'worker',
    status: input.status ?? existing?.status ?? 'active',
    roles:
      input.roles === undefined
        ? normalizeStringArray(existing?.roles)
        : normalizeStringArray(input.roles),
    skillProfile:
      input.skillProfile === undefined
        ? existing?.skillProfile ?? null
        : normalizeNullableString(input.skillProfile),
    mcpProfile:
      input.mcpProfile === undefined
        ? existing?.mcpProfile ?? null
        : normalizeNullableString(input.mcpProfile),
    defaultExecutionTarget: normalizeExecutionTarget(
      input.defaultExecutionTarget,
      existing?.defaultExecutionTarget ?? null,
    ),
    memory: normalizeMemoryCheckpoint(input.memory, existing?.memory ?? null),
    source: input.source ?? existing?.source ?? 'core_record',
    sourceId:
      input.sourceId === undefined
        ? existing?.sourceId ?? null
        : normalizeNullableString(input.sourceId),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    archivedAt:
      input.archivedAt === undefined
        ? existing?.archivedAt ?? null
        : normalizeNullableString(input.archivedAt),
  };

  const { records, created } = replaceById(core.actors, actor);

  return {
    core: touchCoreState(
      {
        ...core,
        actors: records,
      },
      nowIso,
    ),
    actor,
    created,
  };
}
