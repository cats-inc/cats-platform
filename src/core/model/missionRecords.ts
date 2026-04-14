import { randomUUID } from 'node:crypto';

import { CoreValidationError } from '../errors.js';
import type { CoreMissionWriteInput } from './inputs.js';
import {
  normalizeMetadata,
  normalizeNullableString,
  replaceById,
  touchCoreState,
} from './shared.js';
import type {
  CatsCoreState,
  MissionRecord,
} from '../types.js';

export function upsertCoreMission(
  core: CatsCoreState,
  input: CoreMissionWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; mission: MissionRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Mission title is required', 'mission_title_required');
  }

  const missionId = normalizeNullableString(input.id) ?? `mission-${randomUUID()}`;
  const existing = core.missions.find((mission) => mission.id === missionId);
  const mission: MissionRecord = {
    id: missionId,
    managedWorkId:
      input.managedWorkId === undefined
        ? existing?.managedWorkId ?? null
        : normalizeNullableString(input.managedWorkId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    sourceTurnId:
      input.sourceTurnId === undefined
        ? existing?.sourceTurnId ?? null
        : normalizeNullableString(input.sourceTurnId),
    sourceLaneId:
      input.sourceLaneId === undefined
        ? existing?.sourceLaneId ?? null
        : normalizeNullableString(input.sourceLaneId),
    assignedAgentId:
      input.assignedAgentId === undefined
        ? existing?.assignedAgentId ?? null
        : normalizeNullableString(input.assignedAgentId),
    title,
    status: input.status ?? existing?.status ?? 'draft',
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.missions, mission);

  return {
    core: touchCoreState(
      {
        ...core,
        missions: records,
      },
      nowIso,
    ),
    mission,
    created,
  };
}
