export const CATS_CORE_STATE_VERSION = 2 as const;

export interface CoreRecordMetadata {
  [key: string]: unknown;
}

export interface ExecutionTargetSummary {
  provider: string;
  instance: string | null;
  model: string | null;
}

export interface MemoryCheckpointSummary {
  summary: string | null;
  facts: string[];
  openLoops: string[];
  updatedAt: string | null;
}

export type CoreActorKind =
  | 'owner'
  | 'orchestrator'
  | 'worker'
  | 'stakeholder'
  | 'bot';

export type CoreActorStatus = 'active' | 'archived';

export interface CoreActorRecord {
  id: string;
  name: string;
  kind: CoreActorKind;
  status: CoreActorStatus;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  defaultExecutionTarget: ExecutionTargetSummary | null;
  memory: MemoryCheckpointSummary;
  source: 'owner_profile' | 'global_orchestrator' | 'chat_cat';
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type CoreConversationKind =
  | 'chat_channel'
  | 'direct_message'
  | 'external_transport'
  | 'private_escalation';

export type CoreConversationStatus = 'planned' | 'active' | 'archived';

export interface CoreConversationRecord {
  id: string;
  title: string;
  kind: CoreConversationKind;
  status: CoreConversationStatus;
  participantActorIds: string[];
  sourceChannelId: string | null;
  repoPath: string | null;
  responseLanguage: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export type CoreApprovalStatus =
  | 'not_requested'
  | 'pending'
  | 'approved'
  | 'rejected';

export interface CoreApprovalRecord {
  status: CoreApprovalStatus;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedByActorId: string | null;
  notes: string | null;
}

export type CoreApprovalKind = 'dispatch_plan';

export type CoreApprovalDecisionAction = 'approve' | 'revise' | 'reject';

export interface CoreApprovalDecisionOptionRecord {
  action: CoreApprovalDecisionAction;
  label: string;
  description: string;
}

export interface CoreApprovalQueueItem {
  id: string;
  kind: CoreApprovalKind;
  taskId: string;
  conversationId: string | null;
  status: CoreApprovalStatus;
  title: string;
  summary: string | null;
  requestedByActorId: string | null;
  requestedForActorId: string;
  requestedAt: string | null;
  decidedAt: string | null;
  decidedByActorId: string | null;
  notes: string | null;
  requiresOwnerDecision: boolean;
  decisionOptions: CoreApprovalDecisionOptionRecord[];
}

export type CoreTaskStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'archived';

export interface CoreTaskRecord {
  id: string;
  title: string;
  status: CoreTaskStatus;
  conversationId: string | null;
  ownerActorId: string;
  orchestratorActorId: string | null;
  assignedActorIds: string[];
  summary: string | null;
  approval: CoreApprovalRecord;
  createdAt: string;
  updatedAt: string;
}

export type CoreRunStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CoreRunRecord {
  id: string;
  title: string;
  status: CoreRunStatus;
  conversationId: string | null;
  taskId: string | null;
  parentRunId: string | null;
  orchestratorActorId: string | null;
  traceId: string | null;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreTraceKind =
  | 'note'
  | 'status'
  | 'dispatch'
  | 'approval'
  | 'checkpoint'
  | 'outcome'
  | 'error';

export interface CoreTraceRecord {
  id: string;
  traceId: string;
  kind: CoreTraceKind;
  conversationId: string | null;
  runId: string | null;
  taskId: string | null;
  actorId: string | null;
  message: string;
  createdAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreCheckpointStatus = 'open' | 'completed' | 'cancelled';

export interface CoreCheckpointRecord {
  id: string;
  label: string;
  status: CoreCheckpointStatus;
  conversationId: string | null;
  runId: string | null;
  taskId: string | null;
  sourceTraceId: string | null;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreOrchestrationOutcomeStatus =
  | 'succeeded'
  | 'blocked'
  | 'failed'
  | 'cancelled';

export interface CoreOrchestrationOutcomeRecord {
  id: string;
  title: string;
  status: CoreOrchestrationOutcomeStatus;
  conversationId: string | null;
  runId: string | null;
  taskId: string | null;
  summary: string | null;
  recordedAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type BotBindingPlatform = 'telegram' | 'line';

export interface BotBindingRecord {
  id: string;
  platform: BotBindingPlatform;
  botName: string;
  orchestratorActorId: string;
  bossCatActorId: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveMetadataRecord {
  id: string;
  sourceConversationId: string;
  sourceChannelId: string | null;
  exportFormat: 'chat-channel-json';
  status: 'not_ready' | 'ready_for_archive' | 'archived';
  lastExportedAt: string | null;
  updatedAt: string;
}

export interface OwnerProfileRecord {
  actorId: string;
  displayName: string;
  avatarColor: string | null;
  summary: string | null;
  communicationPreferences: string[];
  decisionPreferences: string[];
  escalationPreferences: string[];
  updatedAt: string;
}

export interface CatsCoreState {
  version: typeof CATS_CORE_STATE_VERSION;
  updatedAt: string;
  setupCompleteAt: string | null;
  ownerProfile: OwnerProfileRecord;
  actors: CoreActorRecord[];
  conversations: CoreConversationRecord[];
  tasks: CoreTaskRecord[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  botBindings: BotBindingRecord[];
  archives: ArchiveMetadataRecord[];
}
