import type { ProviderModelSelection } from '../shared/providerSelection.js';

export const CATS_CORE_STATE_VERSION = 5 as const;

export const CORE_CANONICAL_ID_KEYS = [
  'agentId',
  'participantId',
  'containerId',
  'conversationId',
  'turnId',
  'laneId',
  'sessionId',
  'transportBindingId',
  'managedWorkId',
  'missionId',
  'runId',
] as const;

export type CanonicalIdKey = (typeof CORE_CANONICAL_ID_KEYS)[number];

export const CORE_CANONICAL_RECORD_FAMILIES = [
  'AgentRecord',
  'ParticipantRecord',
  'ContainerRecord',
  'ConversationRecord',
  'TurnRecord',
  'LaneRecord',
  'SegmentRecord',
  'SessionRecord',
  'TransportBindingRecord',
  'ManagedWorkRecord',
  'MissionRecord',
  'RunRecord',
] as const;

export type CanonicalRecordFamily = (typeof CORE_CANONICAL_RECORD_FAMILIES)[number];

export interface CoreRecordMetadata {
  [key: string]: unknown;
}

export type AgentId = string;
export type ParticipantId = string;
export type ContainerId = string;
export type ConversationId = string;
export type TurnId = string;
// `laneId` is the durable transcript/read-model identity.
export type LaneId = string;
// `sessionId` is an ephemeral runtime attachment and must not replace `laneId`.
export type SessionId = string;
export type TransportBindingId = string;
export type ManagedWorkId = string;
export type MissionId = string;
export type RunId = string;

export type AgentRecord = CoreActorRecord;
export type ConversationRecord = CoreConversationRecord;
export type ManagedWorkRecord = CoreWorkItemRecord;
export type RunRecord = CoreRunRecord;

export type ParticipantRecordStatus = 'active' | 'inactive' | 'removed';

export interface ParticipantRecord {
  id: ParticipantId;
  conversationId: ConversationId;
  agentId: AgentId;
  joinedAt: string;
  updatedAt: string;
  role: string | null;
  status: ParticipantRecordStatus;
  metadata: CoreRecordMetadata;
}

export type ContainerRecordKind =
  | 'chat_root'
  | 'parallel_group'
  | 'project_workspace'
  | 'work_portfolio';

export type ContainerRecordStatus = 'active' | 'archived';

export interface ContainerRecord {
  id: ContainerId;
  kind: ContainerRecordKind;
  title: string;
  status: ContainerRecordStatus;
  parentContainerId: ContainerId | null;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type TurnRecordKind = 'user' | 'agent' | 'system' | 'transport';
export type TurnRecordStatus = 'planned' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface TurnRecord {
  id: TurnId;
  conversationId: ConversationId;
  kind: TurnRecordKind;
  status: TurnRecordStatus;
  sourceParticipantId: ParticipantId | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type LaneRecordStatus =
  | 'pending'
  | 'waiting'
  | 'connecting'
  | 'running'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface LaneRecord {
  id: LaneId;
  turnId: TurnId;
  conversationId: ConversationId;
  participantId: ParticipantId | null;
  agentId: AgentId | null;
  orderIndex: number;
  status: LaneRecordStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type SegmentRecordKind = 'status' | 'text' | 'tool' | 'artifact' | 'system';
export type SegmentRecordStatus = 'pending' | 'streaming' | 'complete' | 'failed' | 'cancelled';

export interface SegmentRecord {
  id: string;
  laneId: LaneId;
  turnId: TurnId;
  conversationId: ConversationId;
  sessionId: SessionId | null;
  sequence: number;
  kind: SegmentRecordKind;
  status: SegmentRecordStatus;
  content: string | null;
  createdAt: string;
  completedAt: string | null;
  metadata: CoreRecordMetadata;
}

export type SessionRecordStatus = 'connecting' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface SessionRecord {
  id: SessionId;
  conversationId: ConversationId;
  turnId: TurnId | null;
  laneId: LaneId | null;
  participantId: ParticipantId | null;
  agentId: AgentId | null;
  transportBindingId: TransportBindingId | null;
  runtimeKey: string | null;
  status: SessionRecordStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type TransportBindingPlatform = 'telegram' | 'line' | 'internal' | 'web';
export type TransportBindingDirection = 'inbound' | 'bidirectional';
export type TransportBindingStatus = 'active' | 'disabled' | 'archived';

export interface TransportBindingRecord {
  id: TransportBindingId;
  platform: TransportBindingPlatform;
  direction: TransportBindingDirection;
  conversationId: ConversationId | null;
  participantId: ParticipantId | null;
  agentId: AgentId | null;
  externalThreadKey: string | null;
  status: TransportBindingStatus;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type MissionRecordStatus =
  | 'draft'
  | 'planned'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MissionRecord {
  id: MissionId;
  managedWorkId: ManagedWorkId | null;
  conversationId: ConversationId | null;
  sourceTurnId: TurnId | null;
  sourceLaneId: LaneId | null;
  assignedAgentId: AgentId | null;
  title: string;
  status: MissionRecordStatus;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
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
  | 'chat_participant'
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
  containerId: string | null;
  participantActorIds: string[];
  sourceChannelId: string | null;
  repoPath: string | null;
  responseLanguage: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

/**
 * SPEC-090 typed N:M link relations between Project / Work Item / Task
 * objects. `blocked_by` is intentionally absent from the stored kinds —
 * the projection layer derives it as the inverse of `blocks` per
 * SPEC-090 §FR5.
 */
export type CoreWorkGraphLinkKind =
  | 'blocks'
  | 'related_to'
  | 'duplicate_of'
  | 'follows';

/**
 * SPEC-090 v1 limits link endpoints to the three Planning / Execution
 * record families. The endpoint kind enum is intentionally narrower
 * than the wider `WorkGraphObjectKind` carried elsewhere on the graph.
 */
export type CoreWorkGraphLinkEndpointKind = 'project' | 'work_item' | 'task';

export interface CoreWorkGraphLinkRecord {
  id: string;
  kind: CoreWorkGraphLinkKind;
  sourceRecordFamily: CoreWorkGraphLinkEndpointKind;
  sourceRecordId: string;
  targetRecordFamily: CoreWorkGraphLinkEndpointKind;
  targetRecordId: string;
  createdAt: string;
  updatedAt: string;
  createdByActorId: string | null;
  note: string | null;
  metadata: CoreRecordMetadata;
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
  decisionAction: CoreApprovalDecisionAction | null;
  notes: string | null;
}

export type CoreApprovalKind = 'dispatch_plan';

export type CoreApprovalDecisionAction = 'approve' | 'reroute' | 'reject';

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
  decisionAction: CoreApprovalDecisionAction | null;
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
  parentTaskId?: string | null;
  ownerActorId: string;
  orchestratorActorId: string | null;
  assignedActorIds: string[];
  summary: string | null;
  approval: CoreApprovalRecord;
  createdAt: string;
  updatedAt: string;
  metadata: CoreRecordMetadata;
}

export type CoreDeliveryMode =
  | 'artifact_only'
  | 'commit_only'
  | 'push_branch'
  | 'pr_with_checks'
  | 'deploy_preview';

export type CoreDeliveryGate =
  | 'manual_review_required'
  | 'owner_approval_required'
  | 'publish_artifact_required';

export type CoreEffectivePolicySource =
  | 'chat_default'
  | 'task_override'
  | 'room_tightening'
  | 'approved_exception';

export interface CoreEffectiveDeliveryPolicy {
  mode: CoreDeliveryMode;
  gates: CoreDeliveryGate[];
  source: CoreEffectivePolicySource;
  rationale: string | null;
}

export type CoreBudgetAlertLevel = 'normal' | 'warning' | 'blocked';

export type CoreBudgetAlertSource =
  | 'runtime_usage'
  | 'rate_limit_incident'
  | 'guardrail_state';

export interface CoreEffectiveBudgetPolicy {
  alertLevel: CoreBudgetAlertLevel;
  source: CoreBudgetAlertSource | null;
  rationale: string | null;
}

export type CoreRuntimeDeliveryAction =
  | 'prepare_artifact'
  | 'create_commit'
  | 'push_branch'
  | 'open_pull_request'
  | 'wait_for_checks'
  | 'publish_preview';

export interface CoreRuntimeDeliveryManifestSummary {
  requestedActions: CoreRuntimeDeliveryAction[];
  gates: CoreDeliveryGate[];
  context: {
    channelId: string | null;
    containerId: string | null;
    conversationId: string | null;
    taskId: string | null;
    roomMode: string | null;
    transport: string | null;
    workflowStageId: string | null;
    workflowShape: string | null;
  };
  strict: boolean;
}

export type CoreOperatorActionKind =
  | 'retry'
  | 'acknowledge';

export type CoreRunStatus =
  | 'queued'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface CoreWorkflowBranchStatusCounts {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
  cancelled: number;
  waiting_for_converge: number;
}

export interface CoreWorkflowSummary {
  runStatus: CoreRunStatus | null;
  stageId: string | null;
  shape: string | null;
  reviewRequired: boolean;
  lastCheckpointId: string | null;
  convergeTargetId: string | null;
  continuationCount: number | null;
  dispatchCount: number | null;
  targetCount: number | null;
  branchStatusCounts: CoreWorkflowBranchStatusCounts;
}

export interface CoreGovernanceSummary {
  delivery: CoreEffectiveDeliveryPolicy | null;
  budget: CoreEffectiveBudgetPolicy | null;
  runtimeDeliveryManifest: CoreRuntimeDeliveryManifestSummary | null;
  approval: {
    status: CoreApprovalStatus | null;
    requiresOwnerDecision: boolean;
    pending: boolean;
    latestDecisionAction: CoreApprovalDecisionAction | null;
    notes: string | null;
  };
  latestOperatorAction: {
    kind: CoreOperatorActionKind | null;
    at: string | null;
    by: string | null;
    notes: string | null;
  } | null;
}

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
  | 'operator_action'
  | 'artifact_recorded'
  | 'artifact_canvas_show_intent'
  | 'artifact_canvas_clear_intent'
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
export type BotBindingInboundMode = 'polling' | 'webhook';

export interface BotBindingRecord {
  id: string;
  platform: BotBindingPlatform;
  botName: string;
  orchestratorActorId: string;
  catActorId: string | null;
  bossCatActorId: string | null;
  botToken: string | null;
  webhookSecret: string | null;
  inboundMode: BotBindingInboundMode;
  roomMode: 'chat_channel' | 'direct_message';
  status: 'active' | 'disabled';
  outboundFanoutEnabled?: boolean;
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
  avatarUrl: string | null;
  summary: string | null;
  communicationPreferences: string[];
  decisionPreferences: string[];
  escalationPreferences: string[];
  naturalProductIntentProposalsEnabled: boolean;
  updatedAt: string;
}

export type GuideCatStatus = 'active' | 'dismissed';

export interface GuideCatRecord {
  id: string;
  name: string;
  status?: GuideCatStatus;
  executionTarget: ExecutionTargetSummary;
  modelSelection: ProviderModelSelection | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantPresetRecord {
  id: string;
  name: string;
  executionTarget: ExecutionTargetSummary;
  modelSelection: ProviderModelSelection | null;
  roleHint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatsCoreState {
  version: typeof CATS_CORE_STATE_VERSION;
  updatedAt: string;
  setupCompleteAt: string | null;
  ownerProfile: OwnerProfileRecord;
  guideCat: GuideCatRecord | null;
  assistantPresets: AssistantPresetRecord[];
  actors: CoreActorRecord[];
  participants: ParticipantRecord[];
  containers: ContainerRecord[];
  conversations: CoreConversationRecord[];
  turns: TurnRecord[];
  lanes: LaneRecord[];
  segments: SegmentRecord[];
  sessions: SessionRecord[];
  projects: CoreProjectRecord[];
  workItems: CoreWorkItemRecord[];
  missions: MissionRecord[];
  tasks: CoreTaskRecord[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  artifacts: CoreArtifactRecord[];
  activities: CoreActivityRecord[];
  approvalBindings: CoreApprovalBindingRecord[];
  transportBindings: TransportBindingRecord[];
  botBindings: BotBindingRecord[];
  archives: ArchiveMetadataRecord[];
  durableMemory: DurableMemoryRecord[];
  workGraphLinks: CoreWorkGraphLinkRecord[];
}
