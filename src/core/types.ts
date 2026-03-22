export const CATS_CORE_STATE_VERSION = 4 as const;

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

export type DurableMemorySubjectType = 'cat' | 'owner' | 'relationship' | 'project';
export type DurableMemoryCategory = 'preference' | 'fact' | 'policy' | 'style' | 'relationship' | 'lesson';

export interface DurableMemoryRecord {
  id: string;
  subjectType: DurableMemorySubjectType;
  subjectId: string;
  category: DurableMemoryCategory;
  content: string;
  confidence: number | null;
  sourceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export type EvidenceEventKind = 'user_turn' | 'agent_turn' | 'system_event' | 'routing_decision';

export interface EvidenceEvent {
  id: string;
  conversationId: string;
  sessionId: string | null;
  layer: 'evidence';
  actorId: string | null;
  kind: EvidenceEventKind;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type CoreActorKind =
  | 'owner'
  | 'orchestrator'
  | 'worker'
  | 'stakeholder'
  | 'bot'
  | 'resource';

export type CoreActorStatus = 'active' | 'archived';

export type CoreActorSource =
  | 'owner_profile'
  | 'global_orchestrator'
  | 'chat_cat'
  | 'core_record';

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
  source: CoreActorSource;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export type CoreConversationKind =
  | 'chat_channel'
  | 'direct_message'
  | 'external_transport'
  | 'private_escalation'
  | 'work_thread'
  | 'code_thread';

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

export type CoreProjectStatus = 'planned' | 'active' | 'paused' | 'archived';

export interface CoreProjectRecord {
  id: string;
  title: string;
  status: CoreProjectStatus;
  ownerActorId: string;
  summary: string | null;
  repoPath: string | null;
  primaryConversationId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreWorkItemStatus =
  | 'draft'
  | 'planned'
  | 'ready'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'archived';

export interface CoreWorkItemRecord {
  id: string;
  title: string;
  status: CoreWorkItemStatus;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  parentWorkItemId: string | null;
  ownerActorId: string;
  assignedActorIds: string[];
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
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

export type CoreApprovalBindingKind =
  | 'owner_decision'
  | 'review_gate'
  | 'release_gate';

export type CoreApprovalBindingSubjectKind =
  | 'project'
  | 'work_item'
  | 'task'
  | 'run'
  | 'artifact'
  | 'conversation';

export interface CoreApprovalBindingRecord {
  id: string;
  kind: CoreApprovalBindingKind;
  approvalTaskId: string;
  subjectKind: CoreApprovalBindingSubjectKind;
  subjectId: string;
  projectId: string | null;
  workItemId: string | null;
  conversationId: string | null;
  requestedByActorId: string | null;
  requestedForActorId: string;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreTaskStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'
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

export type CoreArtifactKind =
  | 'document'
  | 'report'
  | 'build'
  | 'preview'
  | 'attachment'
  | 'transcript_export'
  | 'dataset';

export type CoreArtifactStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface CoreArtifactRecord {
  id: string;
  title: string;
  kind: CoreArtifactKind;
  status: CoreArtifactStatus;
  projectId: string | null;
  workItemId: string | null;
  conversationId: string | null;
  taskId: string | null;
  runId: string | null;
  path: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreActivityKind =
  | 'note'
  | 'status_change'
  | 'approval_requested'
  | 'approval_decided'
  | 'artifact_recorded'
  | 'checkpoint_recorded'
  | 'work_item_updated';

export interface CoreActivityRecord {
  id: string;
  kind: CoreActivityKind;
  actorId: string | null;
  projectId: string | null;
  workItemId: string | null;
  conversationId: string | null;
  taskId: string | null;
  runId: string | null;
  artifactId: string | null;
  message: string;
  createdAt: string;
  metadata: CoreRecordMetadata;
}

export type BotBindingPlatform = 'telegram' | 'line';

export interface BotBindingRecord {
  id: string;
  platform: BotBindingPlatform;
  botName: string;
  orchestratorActorId: string;
  catActorId: string | null;
  bossCatActorId: string | null;
  botToken: string | null;
  webhookSecret: string | null;
  roomMode: 'boss_chat' | 'direct_cat_chat' | 'transport_inbox';
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
  projects: CoreProjectRecord[];
  workItems: CoreWorkItemRecord[];
  tasks: CoreTaskRecord[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  artifacts: CoreArtifactRecord[];
  activities: CoreActivityRecord[];
  approvalBindings: CoreApprovalBindingRecord[];
  botBindings: BotBindingRecord[];
  archives: ArchiveMetadataRecord[];
  durableMemory: DurableMemoryRecord[];
}
