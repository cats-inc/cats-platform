import type {
  RoomAssistantTurnDelivery,
  ParticipantSessionStatus,
  RoomRoutingCheckpointKind,
  RoomRoutingMode,
  RoomRoutingParticipantRef,
  RoomRouteResolution,
  RoomRoutingState,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomWorkflowTargetStatus,
} from '../../shared/roomRouting.js';
import type {
  ConversationId,
  LaneId,
  SessionId,
  TurnId,
  CatsCoreState,
  CoreApprovalDecisionAction,
  CoreApprovalQueueItem,
  CoreBudgetAlertLevel,
  CoreBudgetAlertSource,
  CoreCheckpointRecord,
  CoreDeliveryGate,
  CoreDeliveryMode,
  CoreEffectivePolicySource,
  CoreGovernanceSummary,
  CoreOrchestrationOutcomeRecord,
  CoreRuntimeDeliveryAction,
  CoreRunRecord,
  CoreTaskRecord,
  CoreTraceRecord,
  CoreWorkflowSummary,
  ExecutionTargetSummary,
} from '../../core/types.js';
import type { RuntimeClient, RuntimeSkillManifest } from '../runtime/client.js';
import type { CatsMemoryService } from '../memory/index.js';
import type {
  WorkflowContinuationReplayBlockedReason,
  WorkflowContinuationReplaySource,
} from './workflowContinuationReplay.js';

export const ORCHESTRATOR_CONTRACT_VERSION = 1;
export const ORCHESTRATOR_RUNTIME_TOOL_SCHEMA_VERSION = 1;
export const ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION = 1;

export type RuntimeDeliveryContentBlockKind = 'text' | 'tool' | 'status';
export type RuntimeDeliveryContentBlockStatus = 'streaming' | 'complete' | 'error';

export interface RuntimeDeliveryContentBlock {
  id: string;
  index: number;
  kind: RuntimeDeliveryContentBlockKind;
  status: RuntimeDeliveryContentBlockStatus;
  title: string | null;
  text: string;
  toolName: string | null;
  toolId: string | null;
  metadata: Record<string, unknown> | null;
}

export type NormalizedRuntimeDeliveryKind =
  | 'session_status'
  | 'progress'
  | 'content_block'
  | 'result'
  | 'error';

export interface NormalizedRuntimeDeliverySequence {
  segmentIndex: number;
  blockIndex: number | null;
  eventIndex: number;
}

export interface NormalizedRuntimeDeliveryEvent {
  version: typeof ORCHESTRATOR_RUNTIME_DELIVERY_EVENT_VERSION;
  conversationId: ConversationId;
  turnId: TurnId;
  laneId: LaneId;
  sessionId: SessionId | null;
  kind: NormalizedRuntimeDeliveryKind;
  sourceEvent: string;
  eventId: string;
  emittedAt: string;
  sequence: NormalizedRuntimeDeliverySequence;
  payload: Record<string, unknown>;
  contentBlock: RuntimeDeliveryContentBlock | null;
}

export type OrchestratorTransportContext = 'telegram' | 'line' | 'web';
export type OrchestratorExecutionState =
  | 'planned'
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed';
export type OrchestratorExecutionStepPhase =
  | 'approval'
  | 'dispatch'
  | 'execute'
  | 'report'
  | 'recover';
export type OrchestratorExecutionStepKind =
  | 'approval_gate'
  | 'dispatch_group'
  | 'dispatch_target'
  | 'continuation_handoff'
  | 'concurrent_fan_out'
  | 'report_outcome'
  | 'recovery';
export type OrchestratorExecutionStepStatus =
  | 'ready'
  | 'pending'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'skipped';
export type OrchestratorNextActionKind =
  | 'dispatch'
  | 'approve'
  | 'reroute'
  | 'reject'
  | 'retry'
  | 'acknowledge'
  | 'wait'
  | 'complete';

export interface OrchestratorActionEnvelope {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
}

export interface OrchestratorRuntimeToolPlane {
  boundary: 'runtime_mcp_facade';
  productSurfacePath: '/api/runtime/mcp';
  runtimeSurfacePath: '/mcp';
  protocol: 'jsonrpc_2_0_http';
  schemaVersion: number;
  methods: Array<'initialize' | 'tools/list' | 'tools/call' | 'notifications/initialized'>;
  tools: Array<{
    name: string;
    source: 'cats-runtime';
  }>;
}

export interface ToolIntentManifest {
  profileId?: string;
  allowedTools?: string[];
  requiredCapabilities?: string[];
  lazyGroups?: string[];
  context?: {
    catId?: string;
    channelId?: string;
    participantKind?: 'orchestrator' | 'cat';
    roomMode?: 'boss_chat' | 'direct_cat_chat';
    transport?: OrchestratorTransportContext | null;
  };
  strict?: boolean;
}

export type OrchestratorOperatorSeverity =
  | 'muted'
  | 'progress'
  | 'attention'
  | 'error'
  | 'success';

export interface OrchestratorOperatorActivityItem {
  id: string;
  label: string;
  message: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  runId: string | null;
  taskId: string | null;
  severity: OrchestratorOperatorSeverity;
  source: 'activity' | 'trace' | 'checkpoint' | 'outcome';
}

export interface OrchestratorRunMetrics {
  dispatchCount: number | null;
  continuationCount: number | null;
  targetCount: number | null;
}

export interface OrchestratorWorkflowBranchView {
  id: string;
  participantName: string;
  status: string;
  handoffReason: string | null;
  branchStrategy: string | null;
  parentCheckpointId: string | null;
  response: RoomAssistantTurnDelivery | null;
  error: string | null;
}

export interface OrchestratorWorkflowRecommendationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
}

export interface OrchestratorWorkflowRecommendationView {
  source: 'checkpoint' | 'boss_replan' | 'system_inference' | null;
  workflowShape: RoomWorkflowShape | null;
  continuationSource: WorkflowContinuationReplaySource | null;
  branchStrategy: string | null;
  rationale: string | null;
  reviewRequired: boolean;
  candidateTargets: OrchestratorWorkflowRecommendationTargetView[];
  unresolvedTargets: string[];
}

export interface OrchestratorWorkflowContinuationTargetView {
  participantKind: 'orchestrator' | 'cat' | null;
  participantId: string | null;
  participantName: string | null;
  laneId: string | null;
  sessionId: string | null;
}

export interface OrchestratorWorkflowContinuationView {
  checkpointId: string | null;
  stageId: string | null;
  workflowShape: RoomWorkflowShape | null;
  sourceMessageId: string | null;
  sourceTurnId: string | null;
  sourceLaneId: string | null;
  sourceAssistantTurnId: string | null;
  continuationSource: WorkflowContinuationReplaySource | null;
  reviewRequired: boolean;
  convergeTargetId: string | null;
  blockedReason: WorkflowContinuationReplayBlockedReason | null;
  targets: OrchestratorWorkflowContinuationTargetView[];
  targetCount: number;
  targetNames: string[];
  unresolvedTargets: string[];
  replayState: 'ready' | 'in_progress' | 'failed' | null;
  replayTrigger: 'retry' | null;
  replayError: string | null;
  retryAvailable: boolean;
}

export type OrchestratorOperatorAttentionReason =
  | 'approval_pending'
  | 'run_blocked'
  | 'run_failed'
  | 'retry_available'
  | 'workflow_review_required'
  | 'child_tasks_in_progress';

export interface OrchestratorOperatorAttentionView {
  severity: OrchestratorOperatorSeverity;
  reasons: OrchestratorOperatorAttentionReason[];
  needsOperatorAttention: boolean;
}

export interface OrchestratorRuntimeDeliveryIntentView {
  mode: CoreDeliveryMode | null;
  source: CoreEffectivePolicySource | null;
  rationale: string | null;
  gates: CoreDeliveryGate[];
  requestedActions: CoreRuntimeDeliveryAction[];
  strict: boolean;
  requiresOwnerDecision: boolean;
  approvalPending: boolean;
  channelId: string | null;
  conversationId: string | null;
  taskId: string | null;
  roomMode: string | null;
  transport: string | null;
  workflowStageId: string | null;
  workflowShape: string | null;
}

export interface OrchestratorEffectivePolicyView {
  deliveryMode: CoreDeliveryMode | null;
  deliveryGates: CoreDeliveryGate[];
  deliverySource: CoreEffectivePolicySource | null;
  deliveryRationale: string | null;
  budgetAlertLevel: CoreBudgetAlertLevel | null;
  budgetAlertSource: CoreBudgetAlertSource | null;
  budgetRationale: string | null;
}

export interface OrchestratorApprovalActionView {
  kind: CoreApprovalDecisionAction;
  label: string;
  description: string;
  disabled: boolean;
  taskId: string;
  approvalId: string;
  status: CoreApprovalQueueItem['status'];
}

export interface OrchestratorOperatorActionView {
  kind: 'retry' | 'acknowledge';
  label: string;
  description: string;
  disabled: boolean;
  statusLabel: string | null;
  taskId: string | null;
  runId: string | null;
  checkpointId: string | null;
  outcomeId: string | null;
}

export interface OrchestratorRunInspectorView {
  run: CoreRunRecord;
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  approvals: CoreApprovalQueueItem[];
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  metrics: OrchestratorRunMetrics;
  workflowSummary: CoreWorkflowSummary | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowStageId: string | null;
  workflowShape: string | null;
  reviewRequired: boolean;
  branchStates: OrchestratorWorkflowBranchView[];
  latestWorkflowRecommendation: OrchestratorWorkflowRecommendationView | null;
  workflowContinuation: OrchestratorWorkflowContinuationView | null;
  runtimeDeliveryIntent: OrchestratorRuntimeDeliveryIntentView | null;
  attention: OrchestratorOperatorAttentionView | null;
  nextActions: OrchestratorNextAction[];
  approvalActions: OrchestratorApprovalActionView[];
  incidentActions: OrchestratorOperatorActionView[];
}

export interface OrchestratorOperatorView {
  channelId: string;
  conversationId: string;
  actorNameById: Record<string, string>;
  task: CoreTaskRecord | null;
  approvals: CoreApprovalQueueItem[];
  runs: CoreRunRecord[];
  traces: CoreTraceRecord[];
  checkpoints: CoreCheckpointRecord[];
  outcomes: CoreOrchestrationOutcomeRecord[];
  activityFeed: OrchestratorOperatorActivityItem[];
  latestRun: CoreRunRecord | null;
  latestOutcome: CoreOrchestrationOutcomeRecord | null;
  latestCheckpoint: CoreCheckpointRecord | null;
  latestApproval: CoreApprovalQueueItem | null;
  guardReason: string | null;
  cooldownLabel: string | null;
  effectivePolicy: OrchestratorEffectivePolicyView | null;
  governanceSummary: CoreGovernanceSummary | null;
  workflowSummary: CoreWorkflowSummary | null;
  latestWorkflowRecommendation: OrchestratorWorkflowRecommendationView | null;
  workflowContinuation: OrchestratorWorkflowContinuationView | null;
  runtimeDeliveryIntent: OrchestratorRuntimeDeliveryIntentView | null;
  attention: OrchestratorOperatorAttentionView | null;
  nextActions: OrchestratorNextAction[];
  approvalActions: OrchestratorApprovalActionView[];
  incidentActions: OrchestratorOperatorActionView[];
}

export interface OrchestratorMessageView {
  id: string;
}

export interface OrchestratorParticipantExecutionLease {
  laneId: string | null;
  sessionId: string | null;
  status: ParticipantSessionStatus;
  cwd: string | null;
  lastError: string | null;
  provider: string | null;
  model: string | null;
  startedAt: string | null;
  lastUsedAt: string | null;
}

export interface OrchestratorParticipantExecutionState {
  target: ExecutionTargetSummary;
  lease: OrchestratorParticipantExecutionLease;
}

export interface OrchestratorGlobalView {
  executionTarget: ExecutionTargetSummary;
  skillProfile: string | null;
  mcpProfile: string | null;
}

export interface OrchestratorStateView {
  globalOrchestrator: OrchestratorGlobalView;
}

export interface OrchestratorChannelCat {
  catId: string;
  name: string;
  roles: string[];
  skillProfile: string | null;
  mcpProfile: string | null;
  status: 'active' | 'removed';
  joinedAt: string;
  leftAt: string | null;
  avatarColor: string | null;
  execution: OrchestratorParticipantExecutionState;
}

export interface OrchestratorChannelView {
  id: string;
  title: string;
  skillProfile: string | null;
  mcpProfile: string | null;
  orchestratorRoles: string[];
  orchestratorLease: OrchestratorParticipantExecutionLease;
  assignedCats: OrchestratorChannelCat[];
  messages: OrchestratorMessageView[];
  roomRouting?: RoomRoutingState;
}

export interface OrchestratorDispatchResult {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  laneId: string | null;
  sessionId: string | null;
  status: 'sent' | 'skipped' | 'error';
  dispatchId?: string;
  turnId?: string;
  targetStatus?: RoomWorkflowTargetStatus;
  error?: string;
  sourceMessageId?: string;
  trigger?: RoomRoutingTrigger;
  dispatchDepth?: number;
}

export interface OrchestratorChatStore<TState extends OrchestratorStateView = OrchestratorStateView> {
  read(): Promise<TState>;
  write(state: TState): Promise<TState>;
  readCore(): Promise<CatsCoreState>;
  writeCore(state: CatsCoreState): Promise<CatsCoreState>;
  updateCore(
    mutator: (state: CatsCoreState) => CatsCoreState | Promise<CatsCoreState>,
  ): Promise<CatsCoreState>;
}

export interface OrchestratorChannelRouteInput<
  TCompanionStore = unknown,
  TState extends OrchestratorStateView = OrchestratorStateView,
> {
  state: TState;
  channelId: string;
  body: string;
  senderName?: string;
  runtimeClient: RuntimeClient;
  now: Date;
  transport: 'telegram' | 'web';
  chatStore: OrchestratorChatStore<TState>;
  companionStore?: TCompanionStore;
  memoryService?: CatsMemoryService;
  orchestratorPlan?: OrchestratorTurnPlan | null;
}

export interface OrchestratorChannelRouter<
  TCompanionStore = unknown,
  TState extends OrchestratorStateView = OrchestratorStateView,
> {
  buildChannelView(state: TState, channelId: string): OrchestratorChannelView;
  routeChannelMessage(
    input: OrchestratorChannelRouteInput<TCompanionStore, TState>,
  ): Promise<{
    state: TState;
    results: OrchestratorDispatchResult[];
  }>;
}

export interface OrchestratorRoutingTarget extends RoomRoutingParticipantRef {
  laneId: string | null;
  sessionId: string | null;
}

export interface OrchestratorMentionRouteResult {
  targets: OrchestratorRoutingTarget[];
  unresolvedMentions: string[];
  parsedMentionNames: string[];
  trigger: RoomRoutingTrigger;
  routingMode: 'room_default' | 'explicit_single' | 'explicit_multi';
  resolution: RoomRouteResolution;
}

export interface OrchestratorPlannerSurface<TState extends OrchestratorStateView = OrchestratorStateView> {
  buildChannelView(state: TState, channelId: string): OrchestratorChannelView;
  resolveMentionRoute(
    state: TState,
    channelId: string,
    body: string,
    options: {
      allowDefaultTarget: boolean;
      explicitTrigger: RoomRoutingTrigger;
    },
  ): OrchestratorMentionRouteResult;
  resolveRoomRoutingState(roomRouting: RoomRoutingState | null | undefined): RoomRoutingState;
  resolveOrchestratorDisplayName(state: TState): string;
  buildOperatorView(core: CatsCoreState, channelId: string): OrchestratorOperatorView | null;
  buildRunInspectorView(
    operatorView: OrchestratorOperatorView | null,
    runId: string | null | undefined,
  ): OrchestratorRunInspectorView | null;
  resolveConversationId(channelId: string): string;
}

export interface OrchestratorPlanRequest {
  channelId: string;
  body: string;
  senderName?: string;
  transport?: OrchestratorTransportContext;
}

export interface OrchestratorParticipantPlan {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
  roles: string[];
  assignmentStatus: OrchestratorChannelCat['status'] | 'active';
  executionTarget: ExecutionTargetSummary;
  lease: OrchestratorParticipantExecutionLease;
  skillProfile: string | null;
  mcpProfile: string | null;
  runtimeSkills: RuntimeSkillManifest | null;
  toolIntent: ToolIntentManifest | null;
}

export interface OrchestratorDispatchTargetPlan {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
  laneId: string | null;
  sessionId: string | null;
  trigger: RoomRoutingTrigger;
  plannedDepth: number;
  branchStrategy: RoomWorkflowBranchStrategy;
  handoffReason: RoomWorkflowHandoffReason;
  skillProfile: string | null;
  mcpProfile: string | null;
  runtimeSkills: RuntimeSkillManifest | null;
  toolIntent: ToolIntentManifest | null;
}

export interface OrchestratorExecutionTargetRef {
  participantKind: 'orchestrator' | 'cat';
  participantId: string;
  participantName: string;
  laneId: string | null;
  sessionId: string | null;
  trigger: RoomRoutingTrigger | null;
  plannedDepth: number;
  dispatchId: string | null;
  response: RoomAssistantTurnDelivery | null;
  branchStrategy: RoomWorkflowBranchStrategy | null;
  handoffReason: RoomWorkflowHandoffReason | null;
  mentionNames: string[];
  sourceParticipant: RoomRoutingParticipantRef | null;
  sourceMessageId: string | null;
  error: string | null;
}

export interface OrchestratorExecutionCheckpoint {
  checkpointId: string | null;
  checkpointKind: RoomRoutingCheckpointKind | null;
  message: string;
  createdAt: string;
  actor: RoomRoutingParticipantRef | null;
  targets: RoomRoutingParticipantRef[];
}

export interface OrchestratorApprovalActionContract {
  kind: 'approve' | 'reroute' | 'reject';
  label: string;
  disabled: boolean;
  action: OrchestratorActionEnvelope;
}

export interface OrchestratorOperatorActionContract {
  kind: 'retry' | 'acknowledge';
  label: string;
  disabled: boolean;
  statusLabel: string | null;
  action: OrchestratorActionEnvelope;
}

export interface OrchestratorApprovalGate {
  taskId: string;
  status: 'not_requested' | 'pending' | 'approved' | 'rejected';
  latestApprovalId: string | null;
  latestDecisionAction: 'approve' | 'reroute' | 'reject' | null;
  notes: string | null;
  requestAvailable: boolean;
  requestAction: OrchestratorActionEnvelope;
  decisionActions: OrchestratorApprovalActionContract[];
}

export interface OrchestratorRecoveryLoop {
  guardReason: string | null;
  cooldownLabel: string | null;
  incidentActions: OrchestratorOperatorActionContract[];
}

export interface OrchestratorNextAction {
  kind: OrchestratorNextActionKind;
  label: string;
  blocking: boolean;
  action: OrchestratorActionEnvelope | null;
}

export interface OrchestratorExecutionStep {
  id: string;
  phase: OrchestratorExecutionStepPhase;
  kind: OrchestratorExecutionStepKind;
  status: OrchestratorExecutionStepStatus;
  title: string;
  summary: string;
  stageId: string | null;
  workflowShape: RoomWorkflowShape | 'blocked' | null;
  parentStepId: string | null;
  participant: OrchestratorExecutionTargetRef | null;
  targets: OrchestratorExecutionTargetRef[];
  checkpointId: string | null;
  outcomeId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  retryable: boolean;
}

export interface OrchestratorExecutionPlan {
  planner: 'dynamic_room_workflow';
  loopMode: 'checkpoint_driven';
  state: OrchestratorExecutionState;
  stageId: string | null;
  workflowShape: RoomWorkflowShape | 'blocked' | null;
  sourceTurnId: string | null;
  sourceMessageId: string | null;
  steps: OrchestratorExecutionStep[];
  checkpoints: OrchestratorExecutionCheckpoint[];
  nextActions: OrchestratorNextAction[];
  approval: OrchestratorApprovalGate;
  recovery: OrchestratorRecoveryLoop;
}

export interface OrchestratorOperatorSeams {
  conversationId: string;
  taskId: string;
  approvalsPath: '/api/core/approvals';
  operatorActionsPath: '/api/core/operator-actions';
  executionLoopPath: string;
  latestApprovalId: string | null;
  latestRunId: string | null;
}

export interface OrchestratorExecutionLoopContract {
  planner: 'dynamic_room_workflow';
  dispatchBoundary: 'supervised_runtime_boundary';
  initialShape: RoomWorkflowShape | 'blocked';
  initialStageId: string;
  supportsReplan: true;
  guardrails: {
    maxContinuations: number;
    maxDispatchesPerTurn: number;
    maxTargetVisitsPerTurn: number;
  };
}

export interface OrchestratorTurnPlan {
  planId: string;
  snapshot: 'pre_dispatch';
  channelId: string;
  channelTitle: string;
  roomMode: RoomRoutingMode;
  source: {
    body: string;
    senderName: string;
    transport: OrchestratorTransportContext;
  };
  roomCapabilityHints: {
    skillProfile: string | null;
    mcpProfile: string | null;
  };
  routing: {
    trigger: RoomRoutingTrigger;
    resolution: RoomRouteResolution;
    mentionNames: string[];
    unresolvedMentions: string[];
    initialTargets: OrchestratorDispatchTargetPlan[];
  };
  participants: OrchestratorParticipantPlan[];
  executionLoop: OrchestratorExecutionLoopContract;
  runtimeToolPlane: OrchestratorRuntimeToolPlane;
  execution: OrchestratorExecutionPlan;
}

export interface OrchestratorExecutionLoopSnapshot {
  channelId: string;
  runtimeToolPlane: OrchestratorRuntimeToolPlane;
  execution: OrchestratorExecutionPlan;
  operator: OrchestratorOperatorView | null;
  runInspector: OrchestratorRunInspectorView | null;
}

export interface OrchestratorPlanResponse {
  contractVersion: number;
  surface: 'direct_product_api';
  operator: OrchestratorOperatorSeams;
  plan: OrchestratorTurnPlan;
}

export interface OrchestratorDispatchResponse {
  contractVersion: number;
  surface: 'direct_product_api';
  operator: OrchestratorOperatorSeams;
  plan: OrchestratorTurnPlan;
  dispatch: {
    channelId: string;
    status: 'dispatched' | 'blocked';
    blockedReason: 'approval_pending' | null;
    sourceMessageId: string | null;
    results: OrchestratorDispatchResult[];
  };
  executionLoop: OrchestratorExecutionLoopSnapshot;
}

export interface OrchestratorExecutionLoopResponse {
  contractVersion: number;
  surface: 'direct_product_api';
  operator: OrchestratorOperatorSeams;
  executionLoop: OrchestratorExecutionLoopSnapshot;
}

export interface OrchestratorPlannerChannelContext {
  channel: OrchestratorChannelView;
  transport: OrchestratorTransportContext;
}
