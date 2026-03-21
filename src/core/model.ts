import { randomUUID } from 'node:crypto';

import type {
  CoreApprovalDecisionOptionRecord,
  CoreApprovalQueueItem,
  CoreApprovalStatus,
  CoreCheckpointRecord,
  CoreCheckpointStatus,
  CoreOrchestrationOutcomeRecord,
  CoreOrchestrationOutcomeStatus,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreRunStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreTraceKind,
  CoreTraceRecord,
  CatsCoreState,
  CoreActorRecord,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
  OwnerProfileRecord,
} from './types.js';
import { CATS_CORE_STATE_VERSION } from './types.js';

export const OWNER_ACTOR_ID = 'actor-owner';
export const GLOBAL_ORCHESTRATOR_ACTOR_ID = 'actor-orchestrator-global';

export function createPalActorId(palId: string): string {
  return `actor-pal-${palId}`;
}

export function createEmptyMemoryCheckpoint(): MemoryCheckpointSummary {
  return {
    summary: null,
    facts: [],
    openLoops: [],
    updatedAt: null,
  };
}

function createDefaultExecutionTarget(): ExecutionTargetSummary {
  return {
    provider: 'claude',
    instance: null,
    model: null,
  };
}

export function createDefaultOwnerProfile(updatedAt: string = new Date().toISOString()): OwnerProfileRecord {
  return {
    actorId: OWNER_ACTOR_ID,
    displayName: 'Owner',
    avatarColor: null,
    summary: null,
    communicationPreferences: [],
    decisionPreferences: [],
    escalationPreferences: [],
    updatedAt,
  };
}

const DEFAULT_APPROVAL_DECISION_OPTIONS: CoreApprovalDecisionOptionRecord[] = [
  {
    action: 'approve',
    label: 'Approve',
    description: 'Allow the orchestrator plan to proceed.',
  },
  {
    action: 'revise',
    label: 'Request revision',
    description: 'Send the plan back for refinement before execution.',
  },
  {
    action: 'reject',
    label: 'Reject',
    description: 'Do not allow the plan to proceed.',
  },
];

function createOwnerActor(ownerProfile: OwnerProfileRecord): CoreActorRecord {
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

function createDefaultOrchestratorActor(updatedAt: string): CoreActorRecord {
  return {
    id: GLOBAL_ORCHESTRATOR_ACTOR_ID,
    name: 'Orchestrator',
    kind: 'orchestrator',
    status: 'active',
    roles: ['orchestrator', 'coordinator'],
    skillProfile: 'aaif-a2a-default',
    mcpProfile: 'workspace-memory',
    defaultExecutionTarget: createDefaultExecutionTarget(),
    memory: createEmptyMemoryCheckpoint(),
    source: 'global_orchestrator',
    sourceId: 'global',
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
  };
}

export function createDefaultCoreState(): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = createDefaultOwnerProfile(updatedAt);

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: null,
    ownerProfile,
    actors: [createOwnerActor(ownerProfile), createDefaultOrchestratorActor(updatedAt)],
    conversations: [],
    tasks: [],
    runs: [],
    traces: [],
    checkpoints: [],
    outcomes: [],
    botBindings: [],
    archives: [],
  };
}

export function buildApprovalQueue(core: CatsCoreState): CoreApprovalQueueItem[] {
  return core.tasks
    .filter((task) =>
      task.status === 'pending_approval' && task.approval.status === 'pending',
    )
    .map((task) => ({
    id: `approval-${task.id}`,
    kind: 'dispatch_plan',
    taskId: task.id,
    conversationId: task.conversationId,
    status: task.approval.status,
    title: task.title,
    summary: task.summary,
    requestedByActorId: task.orchestratorActorId,
    requestedForActorId: task.ownerActorId,
    requestedAt: task.approval.requestedAt,
    decidedAt: task.approval.decidedAt,
    decidedByActorId: task.approval.decidedByActorId,
    notes: task.approval.notes,
    requiresOwnerDecision: task.approval.status === 'pending',
    decisionOptions: DEFAULT_APPROVAL_DECISION_OPTIONS.map((option) => ({ ...option })),
    }));
}

function touchCoreState(
  core: CatsCoreState,
  updatedAt: string,
): CatsCoreState {
  return {
    ...core,
    updatedAt,
  };
}

function normalizeMetadata(metadata: CoreRecordMetadata | null | undefined): CoreRecordMetadata {
  if (!metadata) {
    return {};
  }

  return structuredClone(metadata);
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return value === null ? null : null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

function replaceById<T extends { id: string }>(
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

export interface CoreTaskWriteInput {
  id?: string;
  title: string;
  status?: CoreTaskStatus;
  conversationId?: string | null;
  ownerActorId?: string;
  orchestratorActorId?: string | null;
  assignedActorIds?: string[];
  summary?: string | null;
  approval?: Partial<{
    status: CoreApprovalStatus;
    requestedAt: string | null;
    decidedAt: string | null;
    decidedByActorId: string | null;
    notes: string | null;
  }>;
  createdAt?: string;
}

export interface OwnerProfilePatchInput {
  displayName?: string;
  avatarColor?: string | null;
  summary?: string | null;
  communicationPreferences?: string[];
  decisionPreferences?: string[];
  escalationPreferences?: string[];
}

export interface CoreApprovalWriteInput {
  taskId: string;
  status: CoreApprovalStatus;
  requestedByActorId?: string | null;
  decidedByActorId?: string | null;
  notes?: string | null;
  taskStatus?: CoreTaskStatus;
}

export interface CoreRunWriteInput {
  id?: string;
  title: string;
  status?: CoreRunStatus;
  conversationId?: string | null;
  taskId?: string | null;
  parentRunId?: string | null;
  orchestratorActorId?: string | null;
  traceId?: string | null;
  summary?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreTraceWriteInput {
  id?: string;
  traceId: string;
  kind: CoreTraceKind;
  conversationId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  message: string;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface CoreCheckpointWriteInput {
  id?: string;
  label: string;
  status?: CoreCheckpointStatus;
  conversationId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  sourceTraceId?: string | null;
  summary?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreOutcomeWriteInput {
  id?: string;
  title: string;
  status?: CoreOrchestrationOutcomeStatus;
  conversationId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  summary?: string | null;
  recordedAt?: string;
  metadata?: CoreRecordMetadata;
}

export function upsertCoreTask(
  core: CatsCoreState,
  input: CoreTaskWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; task: CoreTaskRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new Error('Task title is required');
  }

  const taskId = normalizeNullableString(input.id) ?? `task-${randomUUID()}`;
  const existingTask = core.tasks.find((task) => task.id === taskId);
  const task: CoreTaskRecord = {
    id: taskId,
    title,
    status: input.status ?? existingTask?.status ?? 'draft',
    conversationId:
      input.conversationId === undefined
        ? existingTask?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existingTask?.ownerActorId
      ?? core.ownerProfile.actorId,
    orchestratorActorId:
      input.orchestratorActorId === undefined
        ? existingTask?.orchestratorActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.orchestratorActorId),
    assignedActorIds:
      input.assignedActorIds === undefined
        ? structuredClone(existingTask?.assignedActorIds ?? [])
        : normalizeStringArray(input.assignedActorIds),
    summary:
      input.summary === undefined
        ? existingTask?.summary ?? null
        : normalizeNullableString(input.summary),
    approval: {
      status: input.approval?.status ?? existingTask?.approval.status ?? 'not_requested',
      requestedAt:
        input.approval?.requestedAt === undefined
          ? existingTask?.approval.requestedAt ?? null
          : normalizeNullableString(input.approval.requestedAt),
      decidedAt:
        input.approval?.decidedAt === undefined
          ? existingTask?.approval.decidedAt ?? null
          : normalizeNullableString(input.approval.decidedAt),
      decidedByActorId:
        input.approval?.decidedByActorId === undefined
          ? existingTask?.approval.decidedByActorId ?? null
          : normalizeNullableString(input.approval.decidedByActorId),
      notes:
        input.approval?.notes === undefined
          ? existingTask?.approval.notes ?? null
          : normalizeNullableString(input.approval.notes),
    },
    createdAt: existingTask?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  const { records, created } = replaceById(core.tasks, task);

  return {
    core: touchCoreState(
      {
        ...core,
        tasks: records,
      },
      nowIso,
    ),
    task,
    created,
  };
}

export function patchOwnerProfile(
  core: CatsCoreState,
  patch: OwnerProfilePatchInput,
  now: Date = new Date(),
): { core: CatsCoreState; ownerProfile: OwnerProfileRecord } {
  const nowIso = now.toISOString();
  const displayName = patch.displayName?.trim();
  if (patch.displayName !== undefined && !displayName) {
    throw new Error('Owner profile displayName is required');
  }

  const ownerProfile: OwnerProfileRecord = {
    ...core.ownerProfile,
    displayName: displayName ?? core.ownerProfile.displayName,
    avatarColor:
      patch.avatarColor === undefined
        ? core.ownerProfile.avatarColor
        : normalizeNullableString(patch.avatarColor),
    summary:
      patch.summary === undefined
        ? core.ownerProfile.summary
        : normalizeNullableString(patch.summary),
    communicationPreferences:
      patch.communicationPreferences === undefined
        ? structuredClone(core.ownerProfile.communicationPreferences)
        : normalizeStringArray(patch.communicationPreferences),
    decisionPreferences:
      patch.decisionPreferences === undefined
        ? structuredClone(core.ownerProfile.decisionPreferences)
        : normalizeStringArray(patch.decisionPreferences),
    escalationPreferences:
      patch.escalationPreferences === undefined
        ? structuredClone(core.ownerProfile.escalationPreferences)
        : normalizeStringArray(patch.escalationPreferences),
    updatedAt: nowIso,
  };

  return {
    core: touchCoreState(
      {
        ...core,
        ownerProfile,
      },
      nowIso,
    ),
    ownerProfile,
  };
}

export function writeApprovalDecision(
  core: CatsCoreState,
  input: CoreApprovalWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; task: CoreTaskRecord } {
  const nowIso = now.toISOString();
  const task = core.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`);
  }

  const nextTaskStatus = input.taskStatus
    ?? (input.status === 'pending'
      ? 'pending_approval'
      : input.status === 'approved'
        ? 'approved'
        : 'draft');
  const requestedByActorId = normalizeNullableString(input.requestedByActorId);
  const decidedByActorId = normalizeNullableString(input.decidedByActorId);
  const nextTask: CoreTaskRecord = {
    ...task,
    status: nextTaskStatus,
    approval: {
      status: input.status,
      requestedAt: input.status === 'pending'
        ? nowIso
        : task.approval.requestedAt,
      decidedAt: input.status === 'pending' ? null : nowIso,
      decidedByActorId: input.status === 'pending' ? null : decidedByActorId,
      notes: normalizeNullableString(input.notes),
    },
    orchestratorActorId:
      requestedByActorId
      ?? task.orchestratorActorId
      ?? GLOBAL_ORCHESTRATOR_ACTOR_ID,
    updatedAt: nowIso,
  };

  const nextTasks = core.tasks.map((candidate) =>
    candidate.id === nextTask.id ? nextTask : candidate,
  );

  return {
    core: touchCoreState(
      {
        ...core,
        tasks: nextTasks,
      },
      nowIso,
    ),
    task: nextTask,
  };
}

export function upsertCoreRun(
  core: CatsCoreState,
  input: CoreRunWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; run: CoreRunRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new Error('Run title is required');
  }

  const runId = normalizeNullableString(input.id) ?? `run-${randomUUID()}`;
  const existing = core.runs.find((run) => run.id === runId);
  const run: CoreRunRecord = {
    id: runId,
    title,
    status: input.status ?? existing?.status ?? 'queued',
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    parentRunId:
      input.parentRunId === undefined
        ? existing?.parentRunId ?? null
        : normalizeNullableString(input.parentRunId),
    orchestratorActorId:
      input.orchestratorActorId === undefined
        ? existing?.orchestratorActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.orchestratorActorId),
    traceId:
      input.traceId === undefined
        ? existing?.traceId ?? null
        : normalizeNullableString(input.traceId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    startedAt:
      input.startedAt === undefined
        ? existing?.startedAt ?? null
        : normalizeNullableString(input.startedAt),
    completedAt:
      input.completedAt === undefined
        ? existing?.completedAt ?? null
        : normalizeNullableString(input.completedAt),
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.runs, run);

  return {
    core: touchCoreState(
      {
        ...core,
        runs: records,
      },
      nowIso,
    ),
    run,
    created,
  };
}

export function appendCoreTrace(
  core: CatsCoreState,
  input: CoreTraceWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; trace: CoreTraceRecord; created: boolean } {
  const nowIso = now.toISOString();
  const message = input.message.trim();

  if (!message) {
    throw new Error('Trace message is required');
  }

  const traceId = input.traceId.trim();
  if (!traceId) {
    throw new Error('Trace traceId is required');
  }

  const recordId = normalizeNullableString(input.id) ?? `trace-${randomUUID()}`;
  const existing = core.traces.find((trace) => trace.id === recordId);
  const trace: CoreTraceRecord = {
    id: recordId,
    traceId,
    kind: input.kind,
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    actorId:
      input.actorId === undefined
        ? existing?.actorId ?? null
        : normalizeNullableString(input.actorId),
    message,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.traces, trace);

  return {
    core: touchCoreState(
      {
        ...core,
        traces: records,
      },
      nowIso,
    ),
    trace,
    created,
  };
}

export function upsertCoreCheckpoint(
  core: CatsCoreState,
  input: CoreCheckpointWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; checkpoint: CoreCheckpointRecord; created: boolean } {
  const nowIso = now.toISOString();
  const label = input.label.trim();

  if (!label) {
    throw new Error('Checkpoint label is required');
  }

  const checkpointId = normalizeNullableString(input.id) ?? `checkpoint-${randomUUID()}`;
  const existing = core.checkpoints.find((checkpoint) => checkpoint.id === checkpointId);
  const status = input.status ?? existing?.status ?? 'open';
  const checkpoint: CoreCheckpointRecord = {
    id: checkpointId,
    label,
    status,
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    sourceTraceId:
      input.sourceTraceId === undefined
        ? existing?.sourceTraceId ?? null
        : normalizeNullableString(input.sourceTraceId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    completedAt:
      input.completedAt === undefined
        ? (status === 'completed' ? existing?.completedAt ?? nowIso : existing?.completedAt ?? null)
        : normalizeNullableString(input.completedAt),
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.checkpoints, checkpoint);

  return {
    core: touchCoreState(
      {
        ...core,
        checkpoints: records,
      },
      nowIso,
    ),
    checkpoint,
    created,
  };
}

export function upsertCoreOutcome(
  core: CatsCoreState,
  input: CoreOutcomeWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; outcome: CoreOrchestrationOutcomeRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new Error('Outcome title is required');
  }

  const outcomeId = normalizeNullableString(input.id) ?? `outcome-${randomUUID()}`;
  const existing = core.outcomes.find((outcome) => outcome.id === outcomeId);
  const outcome: CoreOrchestrationOutcomeRecord = {
    id: outcomeId,
    title,
    status: input.status ?? existing?.status ?? 'succeeded',
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    recordedAt: existing?.recordedAt ?? input.recordedAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.outcomes, outcome);

  return {
    core: touchCoreState(
      {
        ...core,
        outcomes: records,
      },
      nowIso,
    ),
    outcome,
    created,
  };
}
