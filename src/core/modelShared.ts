import { CoreValidationError } from './errors.js';
import {
  createEmptyMemoryCheckpoint,
  GLOBAL_ORCHESTRATOR_ACTOR_ID,
} from './actors.js';
import type {
  CatsCoreState,
  CoreActorRecord,
  CoreApprovalDecisionOptionRecord,
  CoreApprovalStatus,
  CoreRecordMetadata,
  ExecutionTargetSummary,
  OwnerProfileRecord,
} from './types.js';
import { CATS_CORE_STATE_VERSION } from './types.js';

export function createDefaultExecutionTarget(): ExecutionTargetSummary {
  return {
    provider: 'claude',
    instance: null,
    model: null,
  };
}

export const DEFAULT_APPROVAL_DECISION_OPTIONS: CoreApprovalDecisionOptionRecord[] = [
  {
    action: 'approve',
    label: 'Approve',
    description: 'Allow the orchestrator plan to proceed.',
  },
  {
    action: 'reroute',
    label: 'Reroute',
    description: 'Send the plan back for a different handoff or dispatch path.',
  },
  {
    action: 'reject',
    label: 'Reject',
    description: 'Do not allow the plan to proceed.',
  },
];

export const ALLOWED_APPROVAL_TRANSITIONS: Record<
  CoreApprovalStatus,
  readonly CoreApprovalStatus[]
> = {
  not_requested: ['not_requested', 'pending', 'approved', 'rejected'],
  pending: ['pending', 'approved', 'rejected'],
  approved: ['approved'],
  rejected: ['rejected'],
};

export function createOwnerActor(ownerProfile: OwnerProfileRecord): CoreActorRecord {
  return {
    id: ownerProfile.actorId,
    name: ownerProfile.displayName,
    kind: 'owner',
    status: 'active',
    roles: ['owner'],
    skillProfile: null,
    mcpProfile: null,
    defaultExecutionTarget: null,
    memory: createEmptyMemoryCheckpoint(),
    source: 'owner_profile',
    sourceId: ownerProfile.actorId,
    createdAt: ownerProfile.updatedAt,
    updatedAt: ownerProfile.updatedAt,
    archivedAt: null,
  };
}

export function createDefaultOrchestratorActor(updatedAt: string): CoreActorRecord {
  return {
    id: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    name: 'Orchestrator',
    kind: 'orchestrator',
    status: 'active',
    roles: ['orchestrator', 'coordinator'],
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'chat-memory',
    defaultExecutionTarget: createDefaultExecutionTarget(),
    memory: createEmptyMemoryCheckpoint(),
    source: 'global_orchestrator',
    sourceId: 'global',
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
  };
}

export function normalizeMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreRecordMetadata {
  if (!metadata) {
    return {};
  }

  return structuredClone(metadata);
}

export function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStringArray(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  return values.filter(
    (value, index) => value.trim().length > 0 && values.indexOf(value) === index,
  );
}

export function normalizeArtifactSizeBytes(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new CoreValidationError(
      'sizeBytes must be a non-negative number',
      'artifact_size_bytes_invalid',
    );
  }

  return value;
}

export function replaceById<T extends { id: string }>(
  records: T[],
  nextRecord: T,
): { records: T[]; created: boolean } {
  const index = records.findIndex((record) => record.id === nextRecord.id);
  if (index === -1) {
    return {
      records: [...records, nextRecord],
      created: true,
    };
  }

  const nextRecords = structuredClone(records);
  nextRecords[index] = nextRecord;
  return {
    records: nextRecords,
    created: false,
  };
}

export function touchCoreState(core: CatsCoreState, updatedAt: string): CatsCoreState {
  return {
    ...core,
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
  };
}

export function replaceOwnerActor(
  actors: CoreActorRecord[],
  ownerProfile: OwnerProfileRecord,
): CoreActorRecord[] {
  const ownerActor = createOwnerActor(ownerProfile);
  const ownerIndex = actors.findIndex((actor) => actor.id === ownerProfile.actorId);

  if (ownerIndex === -1) {
    return [ownerActor, ...structuredClone(actors)];
  }

  const nextActors = structuredClone(actors);
  nextActors[ownerIndex] = ownerActor;
  return nextActors;
}
