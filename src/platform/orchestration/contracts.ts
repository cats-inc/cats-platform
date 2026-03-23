import type {
  ChannelDispatchResult,
  ChatChannelCat,
  ChatChannelView,
  ParticipantExecutionLease,
  RoomRouteResolution,
  RoomRoutingTrigger,
  RoomWorkflowBranchStrategy,
  RoomWorkflowHandoffReason,
  RoomWorkflowShape,
  RoomRoutingMode,
} from '../../shared/app-shell.js';
import type { ExecutionTargetSummary } from '../../core/types.js';
import type { RuntimeSkillManifest } from '../runtime/client.js';
import type {
  ChatOperatorView,
  ChatRunInspectorView,
} from '../../products/chat/shared/operatorLoop.js';

export const ORCHESTRATOR_CONTRACT_VERSION = 1;

export type OrchestratorTransportContext = 'telegram' | 'line' | 'web';

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
}

export interface OrchestratorExecutionLoopSnapshot {
  channelId: string;
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
