import type {
  CoreActivityKind,
  CoreApprovalDecisionAction,
  CoreApprovalBindingKind,
  CoreApprovalBindingSubjectKind,
  CoreApprovalStatus,
  CoreArtifactKind,
  CoreArtifactStatus,
  CoreCheckpointStatus,
  LaneRecordStatus,
  SegmentRecordKind,
  SegmentRecordStatus,
  SessionRecordStatus,
  TransportBindingDirection,
  TransportBindingPlatform,
  TransportBindingStatus,
  CoreOrchestrationOutcomeStatus,
  CoreProjectStatus,
  CoreRecordMetadata,
  CoreRunStatus,
  CoreTaskStatus,
  CoreTraceKind,
  MissionRecordStatus,
  TurnRecordKind,
  TurnRecordStatus,
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

export interface CoreMissionWriteInput {
  id?: string;
  managedWorkId?: string | null;
  conversationId?: string | null;
  sourceTurnId?: string | null;
  sourceLaneId?: string | null;
  assignedAgentId?: string | null;
  title: string;
  status?: MissionRecordStatus;
  summary?: string | null;
  createdAt?: string;
  metadata?: CoreRecordMetadata;
}

export interface CoreTurnWriteInput {
  id?: string;
  conversationId: string;
  kind?: TurnRecordKind;
  status?: TurnRecordStatus;
  sourceParticipantId?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreLaneWriteInput {
  id?: string;
  turnId: string;
  conversationId: string;
  participantId?: string | null;
  agentId?: string | null;
  orderIndex?: number;
  status?: LaneRecordStatus;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreSegmentWriteInput {
  id?: string;
  laneId: string;
  turnId: string;
  conversationId: string;
  sessionId?: string | null;
  sequence?: number;
  kind?: SegmentRecordKind;
  status?: SegmentRecordStatus;
  content?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreSessionWriteInput {
  id?: string;
  conversationId: string;
  turnId?: string | null;
  laneId?: string | null;
  participantId?: string | null;
  agentId?: string | null;
  transportBindingId?: string | null;
  runtimeKey?: string | null;
  status?: SessionRecordStatus;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  metadata?: CoreRecordMetadata;
}

export interface CoreTransportBindingWriteInput {
  id?: string;
  platform: TransportBindingPlatform;
  direction?: TransportBindingDirection;
  conversationId?: string | null;
  participantId?: string | null;
  agentId?: string | null;
  externalThreadKey?: string | null;
  status?: TransportBindingStatus;
  createdAt?: string;
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
