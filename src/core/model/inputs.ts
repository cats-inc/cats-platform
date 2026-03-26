import type {
  CoreActivityKind,
  CoreApprovalDecisionAction,
  CoreApprovalBindingKind,
  CoreApprovalBindingSubjectKind,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreCheckpointStatus,
  CoreOrchestrationOutcomeStatus,
  CoreProjectStatus,
  CoreRecordMetadata,
  CoreRunStatus,
  CoreTaskStatus,
  CoreTraceKind,
  CoreWorkItemStatus,
} from '../types.js';

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
  parentTaskId?: string | null;
  ownerActorId?: string;
  orchestratorActorId?: string | null;
  assignedActorIds?: string[];
  summary?: string | null;
  approval?: Partial<{
    status: CoreApprovalStatus;
    requestedAt: string | null;
    decidedAt: string | null;
    decidedByActorId: string | null;
    decisionAction: CoreApprovalDecisionAction | null;
    notes: string | null;
  }>;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface OwnerProfilePatchInput {
  displayName?: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  summary?: string | null;
  communicationPreferences?: string[];
  decisionPreferences?: string[];
  escalationPreferences?: string[];
}

export interface CoreApprovalWriteInput {
  taskId: string;
  status: CoreApprovalStatus;
  action?: CoreApprovalDecisionAction | null;
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
