import type {
  ChannelDispatchResult,
  ChatChannelCat,
  ChatChannelView,
  ChatState,
  ParticipantExecutionLease,
  RoomRoutingCheckpointKind,
  RoomRoutingParticipantRef,
  RoomRouteResolution,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomRoutingMode,
} from '../../shared/app-shell.js';
import type { CatsCoreState, ExecutionTargetSummary } from '../../core/types.js';
import type { RuntimeClient, RuntimeSkillManifest } from '../runtime/client.js';
import type { CatsMemoryService } from '../memory/index.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../products/chat/shared/operatorLoop.js';

export const ORCHESTRATOR_CONTRACT_VERSION = 1;
export const ORCHESTRATOR_RUNTIME_TOOL_SCHEMA_VERSION = 1;

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
  | 'parallel_fan_out'
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

export interface OrchestratorChatStore {
  read(): Promise<ChatState>;
  write(state: ChatState): Promise<ChatState>;
  readCore(): Promise<CatsCoreState>;
  writeCore(state: CatsCoreState): Promise<CatsCoreState>;
}

export interface OrchestratorChannelRouteInput<TCompanionStore = unknown> {
  state: ChatState;
  channelId: string;
  body: string;
  senderName?: string;
  runtimeClient: RuntimeClient;
  now: Date;
  transport: 'telegram' | 'web';
  chatStore: OrchestratorChatStore;
  companionStore?: TCompanionStore;
  memoryService?: CatsMemoryService;
}

export interface OrchestratorChannelRouter<TCompanionStore = unknown> {
  buildChannelView(state: ChatState, channelId: string): ChatChannelView;
  routeChannelMessage(
    input: OrchestratorChannelRouteInput<TCompanionStore>,
  ): Promise<{
    state: ChatState;
    results: ChannelDispatchResult[];
  }>;
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
  assignmentStatus: ChatChannelCat['status'] | 'active';
  executionTarget: ExecutionTargetSummary;
  lease: ParticipantExecutionLease;
  skillProfile: string | null;
  mcpProfile: string | null;
  runtimeSkills: RuntimeSkillManifest | null;
  toolIntent: ToolIntentManifest | null;
}

export interface OrchestratorDispatchTargetPlan {
  targetKind: 'orchestrator' | 'cat';
  targetId: string;
  targetName: string;
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
  sessionId: string | null;
  trigger: RoomRoutingTrigger | null;
  plannedDepth: number;
  dispatchId: string | null;
  responseMessageId: string | null;
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
  dispatchBoundary: 'direct_runtime_api';
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
  operator: ChatOperatorView | null;
  runInspector: ChatRunInspectorView | null;
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
    results: ChannelDispatchResult[];
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
  channel: ChatChannelView;
  transport: OrchestratorTransportContext;
}
