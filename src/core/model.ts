import { randomUUID } from 'node:crypto';

import {
  CoreConflictError,
  CoreNotFoundError,
  CoreValidationError,
} from './errors.js';
import type {
  CatsCoreState,
  CoreActivityKind,
  CoreActivityRecord,
  CoreActorRecord,
  CoreApprovalBindingKind,
  CoreApprovalBindingRecord,
  CoreApprovalBindingSubjectKind,
  CoreApprovalDecisionOptionRecord,
  CoreApprovalQueueItem,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactRecord,
  CoreArtifactStatus,
  CoreCheckpointRecord,
  CoreCheckpointStatus,
  CoreOrchestrationOutcomeRecord,
  CoreOrchestrationOutcomeStatus,
  CoreProjectRecord,
  CoreProjectStatus,
  CoreRecordMetadata,
  CoreRunRecord,
  CoreRunStatus,
  CoreTaskRecord,
  CoreTaskStatus,
  CoreTraceKind,
  CoreTraceRecord,
  CoreWorkItemRecord,
  CoreWorkItemStatus,
  ExecutionTargetSummary,
  MemoryCheckpointSummary,
  OwnerProfileRecord,
} from './types.js';
import { CATS_CORE_STATE_VERSION } from './types.js';

export const OWNER_ACTOR_ID = 'actor-owner';
export const GLOBAL_ORCHESTRATOR_ACTOR_ID = 'actor-orchestrator-global';

export function createCatActorId(catId: string): string {
  return `actor-cat-${catId}`;
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

export function createDefaultOwnerProfile(
  updatedAt: string = new Date().toISOString(),
): OwnerProfileRecord {
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

const ALLOWED_APPROVAL_TRANSITIONS: Record<
  CoreApprovalStatus,
  readonly CoreApprovalStatus[]
> = {
  not_requested: ['not_requested', 'pending', 'approved', 'rejected'],
  pending: ['pending', 'approved', 'rejected'],
  approved: ['approved'],
  rejected: ['rejected'],
};

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

function normalizeMetadata(
  metadata: CoreRecordMetadata | null | undefined,
): CoreRecordMetadata {
  if (!metadata) {
    return {};
  }

  return structuredClone(metadata);
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  return values.filter(
    (value, index) => value.trim().length > 0 && values.indexOf(value) === index,
  );
}

function normalizeArtifactSizeBytes(value: number | null | undefined): number | null {
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

function touchCoreState(core: CatsCoreState, updatedAt: string): CatsCoreState {
  return {
    ...core,
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
  };
}

function replaceOwnerActor(
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

export function createDefaultCoreState(): CatsCoreState {
  const updatedAt = new Date().toISOString();
  const ownerProfile = createDefaultOwnerProfile(updatedAt);

  return {
    version: CATS_CORE_STATE_VERSION,
    updatedAt,
    setupCompleteAt: null,
    ownerProfile,
    actors: [
      createOwnerActor(ownerProfile),
      createDefaultOrchestratorActor(updatedAt),
    ],
    conversations: [],
    projects: [],
    workItems: [],
    tasks: [],
    runs: [],
    traces: [],
    checkpoints: [],
    outcomes: [],
    artifacts: [],
    activities: [],
    approvalBindings: [],
    botBindings: [],
    archives: [],
  };
}

export function buildApprovalQueue(core: CatsCoreState): CoreApprovalQueueItem[] {
  return core.tasks
    .filter(
      (task) =>
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
      decisionOptions: DEFAULT_APPROVAL_DECISION_OPTIONS.map((option) => ({
        ...option,
      })),
    }));
}

export interface CoreProjectWriteInput {
  id?: string;
  title: string;
  status?: CoreProjectStatus;
  ownerActorId?: string;
  summary?: string | null;
  repoPath?: string | null;
  primaryConversationId?: string | null;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface CoreWorkItemWriteInput {
  id?: string;
  title: string;
  status?: CoreWorkItemStatus;
  projectId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  parentWorkItemId?: string | null;
  ownerActorId?: string;
  assignedActorIds?: string[];
  summary?: string | null;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
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

export interface CoreArtifactWriteInput {
  id?: string;
  title: string;
  kind?: CoreArtifactKind;
  status?: CoreArtifactStatus;
  projectId?: string | null;
  workItemId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  path?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  summary?: string | null;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface CoreActivityWriteInput {
  id?: string;
  kind: CoreActivityKind;
  actorId?: string | null;
  projectId?: string | null;
  workItemId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  artifactId?: string | null;
  message: string;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface CoreApprovalBindingWriteInput {
  id?: string;
  kind?: CoreApprovalBindingKind;
  approvalTaskId: string;
  subjectKind: CoreApprovalBindingSubjectKind;
  subjectId: string;
  projectId?: string | null;
  workItemId?: string | null;
  conversationId?: string | null;
  requestedByActorId?: string | null;
  requestedForActorId?: string;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export function upsertCoreProject(
  core: CatsCoreState,
  input: CoreProjectWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; project: CoreProjectRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Project title is required', 'project_title_required');
  }

  const projectId = normalizeNullableString(input.id) ?? `project-${randomUUID()}`;
  const existing = core.projects.find((project) => project.id === projectId);
  const project: CoreProjectRecord = {
    id: projectId,
    title,
    status: input.status ?? existing?.status ?? 'planned',
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    summary:
      input.summary === undefined
        ? existing?.summary ?? null
        : normalizeNullableString(input.summary),
    repoPath:
      input.repoPath === undefined
        ? existing?.repoPath ?? null
        : normalizeNullableString(input.repoPath),
    primaryConversationId:
      input.primaryConversationId === undefined
        ? existing?.primaryConversationId ?? null
        : normalizeNullableString(input.primaryConversationId),
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.projects, project);

  return {
    core: touchCoreState(
      {
        ...core,
        projects: records,
      },
      nowIso,
    ),
    project,
    created,
  };
}

export function upsertCoreWorkItem(
  core: CatsCoreState,
  input: CoreWorkItemWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; workItem: CoreWorkItemRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError(
      'Work item title is required',
      'work_item_title_required',
    );
  }

  const workItemId = normalizeNullableString(input.id) ?? `work-item-${randomUUID()}`;
  const existing = core.workItems.find((workItem) => workItem.id === workItemId);
  const workItem: CoreWorkItemRecord = {
    id: workItemId,
    title,
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    parentWorkItemId:
      input.parentWorkItemId === undefined
        ? existing?.parentWorkItemId ?? null
        : normalizeNullableString(input.parentWorkItemId),
    ownerActorId:
      normalizeNullableString(input.ownerActorId)
      ?? existing?.ownerActorId
      ?? core.ownerProfile.actorId,
    assignedActorIds:
      input.assignedActorIds === undefined
        ? structuredClone(existing?.assignedActorIds ?? [])
        : normalizeStringArray(input.assignedActorIds),
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

  const { records, created } = replaceById(core.workItems, workItem);

  return {
    core: touchCoreState(
      {
        ...core,
        workItems: records,
      },
      nowIso,
    ),
    workItem,
    created,
  };
}

export function upsertCoreTask(
  core: CatsCoreState,
  input: CoreTaskWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; task: CoreTaskRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError('Task title is required', 'task_title_required');
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
    throw new CoreValidationError(
      'Owner profile displayName is required',
      'owner_profile_display_name_required',
    );
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
        actors: replaceOwnerActor(core.actors, ownerProfile),
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
    throw new CoreNotFoundError(`Task not found: ${input.taskId}`, 'task_not_found');
  }

  if (!ALLOWED_APPROVAL_TRANSITIONS[task.approval.status].includes(input.status)) {
    throw new CoreConflictError(
      `Approval transition not allowed: ${task.approval.status} -> ${input.status}`,
      'approval_transition_invalid',
    );
  }

  const nextTaskStatus =
    input.taskStatus
    ?? (input.status === 'pending'
      ? 'pending_approval'
      : input.status === 'approved'
        ? 'approved'
        : task.status);
  const requestedByActorId = normalizeNullableString(input.requestedByActorId);
  const decidedByActorId = normalizeNullableString(input.decidedByActorId);
  const existingApproval = task.approval;
  const nextRequestedAt =
    input.status === 'pending'
      ? existingApproval.status === 'pending'
        ? existingApproval.requestedAt ?? nowIso
        : nowIso
      : existingApproval.requestedAt;
  const nextDecidedAt =
    input.status === 'approved' || input.status === 'rejected'
      ? existingApproval.status === input.status
        ? existingApproval.decidedAt ?? nowIso
        : nowIso
      : null;
  const nextTask: CoreTaskRecord = {
    ...task,
    status: nextTaskStatus,
    approval: {
      status: input.status,
      requestedAt: nextRequestedAt,
      decidedAt: nextDecidedAt,
      decidedByActorId:
        input.status === 'pending'
          ? null
          : decidedByActorId ?? existingApproval.decidedByActorId,
      notes:
        input.notes === undefined
          ? existingApproval.notes
          : normalizeNullableString(input.notes),
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
    throw new CoreValidationError('Run title is required', 'run_title_required');
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
    throw new CoreValidationError('Trace message is required', 'trace_message_required');
  }

  const traceId = input.traceId.trim();
  if (!traceId) {
    throw new CoreValidationError('Trace traceId is required', 'trace_trace_id_required');
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
    throw new CoreValidationError(
      'Checkpoint label is required',
      'checkpoint_label_required',
    );
  }

  const checkpointId =
    normalizeNullableString(input.id) ?? `checkpoint-${randomUUID()}`;
  const existing = core.checkpoints.find(
    (checkpoint) => checkpoint.id === checkpointId,
  );
  const status = input.status ?? existing?.status ?? 'open';
  const explicitCompletedAt =
    input.completedAt === undefined
      ? undefined
      : normalizeNullableString(input.completedAt);
  if (status !== 'completed' && explicitCompletedAt) {
    throw new CoreValidationError(
      'checkpoint.completedAt can only be set when status is completed',
      'checkpoint_completed_at_invalid',
    );
  }
  const completedAt =
    status === 'completed'
      ? explicitCompletedAt ?? existing?.completedAt ?? nowIso
      : null;
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
    completedAt,
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
    throw new CoreValidationError('Outcome title is required', 'outcome_title_required');
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

export function upsertCoreArtifact(
  core: CatsCoreState,
  input: CoreArtifactWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; artifact: CoreArtifactRecord; created: boolean } {
  const nowIso = now.toISOString();
  const title = input.title.trim();

  if (!title) {
    throw new CoreValidationError(
      'Artifact title is required',
      'artifact_title_required',
    );
  }

  const artifactId = normalizeNullableString(input.id) ?? `artifact-${randomUUID()}`;
  const existing = core.artifacts.find((artifact) => artifact.id === artifactId);
  const artifact: CoreArtifactRecord = {
    id: artifactId,
    title,
    kind: input.kind ?? existing?.kind ?? 'document',
    status: input.status ?? existing?.status ?? 'draft',
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    taskId:
      input.taskId === undefined
        ? existing?.taskId ?? null
        : normalizeNullableString(input.taskId),
    runId:
      input.runId === undefined
        ? existing?.runId ?? null
        : normalizeNullableString(input.runId),
    path:
      input.path === undefined
        ? existing?.path ?? null
        : normalizeNullableString(input.path),
    mimeType:
      input.mimeType === undefined
        ? existing?.mimeType ?? null
        : normalizeNullableString(input.mimeType),
    sizeBytes:
      input.sizeBytes === undefined
        ? existing?.sizeBytes ?? null
        : normalizeArtifactSizeBytes(input.sizeBytes),
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

  const { records, created } = replaceById(core.artifacts, artifact);

  return {
    core: touchCoreState(
      {
        ...core,
        artifacts: records,
      },
      nowIso,
    ),
    artifact,
    created,
  };
}

export function appendCoreActivity(
  core: CatsCoreState,
  input: CoreActivityWriteInput,
  now: Date = new Date(),
): { core: CatsCoreState; activity: CoreActivityRecord; created: boolean } {
  const nowIso = now.toISOString();
  const message = input.message.trim();

  if (!message) {
    throw new CoreValidationError(
      'Activity message is required',
      'activity_message_required',
    );
  }

  const activityId = normalizeNullableString(input.id) ?? `activity-${randomUUID()}`;
  const existing = core.activities.find((activity) => activity.id === activityId);
  if (existing) {
    throw new CoreConflictError(
      `Activity already exists: ${activityId}`,
      'activity_already_exists',
    );
  }
  const activity: CoreActivityRecord = {
    id: activityId,
    kind: input.kind,
    actorId: input.actorId === undefined ? null : normalizeNullableString(input.actorId),
    projectId: input.projectId === undefined ? null : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined ? null : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? null
        : normalizeNullableString(input.conversationId),
    taskId: input.taskId === undefined ? null : normalizeNullableString(input.taskId),
    runId: input.runId === undefined ? null : normalizeNullableString(input.runId),
    artifactId:
      input.artifactId === undefined
        ? null
        : normalizeNullableString(input.artifactId),
    message,
    createdAt: input.createdAt ?? nowIso,
    metadata: normalizeMetadata(input.metadata),
  };

  return {
    core: touchCoreState(
      {
        ...core,
        activities: [...core.activities, activity],
      },
      nowIso,
    ),
    activity,
    created: true,
  };
}

export function upsertCoreApprovalBinding(
  core: CatsCoreState,
  input: CoreApprovalBindingWriteInput,
  now: Date = new Date(),
): {
  core: CatsCoreState;
  approvalBinding: CoreApprovalBindingRecord;
  created: boolean;
} {
  const nowIso = now.toISOString();
  const approvalTaskId = input.approvalTaskId.trim();
  const subjectId = input.subjectId.trim();

  if (!approvalTaskId) {
    throw new CoreValidationError(
      'approvalBinding.approvalTaskId is required',
      'approval_binding_task_id_required',
    );
  }

  if (!subjectId) {
    throw new CoreValidationError(
      'approvalBinding.subjectId is required',
      'approval_binding_subject_id_required',
    );
  }
  if (!core.tasks.some((task) => task.id === approvalTaskId)) {
    throw new CoreNotFoundError(
      `Task not found: ${approvalTaskId}`,
      'task_not_found',
    );
  }

  const approvalBindingId =
    normalizeNullableString(input.id) ?? `approval-binding-${randomUUID()}`;
  const existing = core.approvalBindings.find(
    (binding) => binding.id === approvalBindingId,
  );
  const approvalBinding: CoreApprovalBindingRecord = {
    id: approvalBindingId,
    kind: input.kind ?? existing?.kind ?? 'owner_decision',
    approvalTaskId,
    subjectKind: input.subjectKind,
    subjectId,
    projectId:
      input.projectId === undefined
        ? existing?.projectId ?? null
        : normalizeNullableString(input.projectId),
    workItemId:
      input.workItemId === undefined
        ? existing?.workItemId ?? null
        : normalizeNullableString(input.workItemId),
    conversationId:
      input.conversationId === undefined
        ? existing?.conversationId ?? null
        : normalizeNullableString(input.conversationId),
    requestedByActorId:
      input.requestedByActorId === undefined
        ? existing?.requestedByActorId ?? GLOBAL_ORCHESTRATOR_ACTOR_ID
        : normalizeNullableString(input.requestedByActorId),
    requestedForActorId:
      normalizeNullableString(input.requestedForActorId)
      ?? existing?.requestedForActorId
      ?? core.ownerProfile.actorId,
    createdAt: existing?.createdAt ?? input.createdAt ?? nowIso,
    updatedAt: nowIso,
    metadata:
      input.metadata === undefined
        ? normalizeMetadata(existing?.metadata)
        : normalizeMetadata(input.metadata),
  };

  const { records, created } = replaceById(core.approvalBindings, approvalBinding);

  return {
    core: touchCoreState(
      {
        ...core,
        approvalBindings: records,
      },
      nowIso,
    ),
    approvalBinding,
    created,
  };
}
