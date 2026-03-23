import { randomUUID } from 'node:crypto';

import type {
  ChatChannelCat,
  ChatChannelView,
  ChatState,
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../shared/app-shell.js';
import { buildApprovalQueue } from '../../core/model.js';
import { buildChannelView, resolveOrchestratorDisplayName } from '../../products/chat/state/model.js';
import { resolveMentionRoute } from '../../products/chat/state/mentionRouter.js';
import { resolveRoomRoutingState } from '../../products/chat/state/roomRouting.js';
import { resolveSkillProfileManifest } from '../../shared/skillProfiles.js';
import {
  buildChatOperatorView,
  buildRunInspectorView,
  resolveChatConversationId,
  type ChatOperatorSnapshot,
} from '../../products/chat/shared/operatorLoop.js';
import type { CatsCoreState } from '../../core/types.js';
import type {
  OrchestratorDispatchTargetPlan,
  OrchestratorExecutionLoopResponse,
  OrchestratorExecutionLoopSnapshot,
  OrchestratorOperatorSeams,
  OrchestratorParticipantPlan,
  OrchestratorPlanRequest,
  OrchestratorPlanResponse,
  OrchestratorTransportContext,
  OrchestratorTurnPlan,
  OrchestratorExecutionLoopContract,
  OrchestratorPlannerChannelContext,
} from './contracts.js';
import { ORCHESTRATOR_CONTRACT_VERSION } from './contracts.js';
import { resolveToolIntentManifest } from './toolIntent.js';

function buildOperatorSnapshot(core: CatsCoreState): ChatOperatorSnapshot {
  return {
    core,
    approvals: buildApprovalQueue(core),
  };
}

function resolveTransport(
  transport?: OrchestratorTransportContext,
): OrchestratorTransportContext {
  return transport ?? 'web';
}

function workflowShapeForTargets(targetCount: number) {
  return targetCount > 1 ? 'parallel' : 'sequential';
}

function workflowStageIdForTrigger(trigger: RoomRoutingTrigger): string {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_dispatch';
    case 'continuation_mention':
      return 'continuation_handoff';
    case 'room_default':
    default:
      return 'default_dispatch';
  }
}

function resolveWorkflowHandoffReason(trigger: RoomRoutingTrigger) {
  switch (trigger) {
    case 'explicit_mention':
      return 'explicit_mention';
    case 'continuation_mention':
      return 'workflow_continuation';
    case 'room_default':
    default:
      return 'room_default';
  }
}

function buildOrchestratorOperatorSeams(
  core: CatsCoreState,
  channelId: string,
): OrchestratorOperatorSeams {
  const operatorView = buildChatOperatorView(buildOperatorSnapshot(core), channelId);

  return {
    conversationId: operatorView?.conversationId ?? resolveChatConversationId(channelId),
    taskId: operatorView?.task?.id ?? `task-channel-${channelId}`,
    approvalsPath: '/api/core/approvals',
    operatorActionsPath: '/api/core/operator-actions',
    executionLoopPath: `/api/orchestrator/channels/${channelId}/execution-loop`,
    latestApprovalId: operatorView?.latestApproval?.id ?? null,
    latestRunId: operatorView?.latestRun?.id ?? null,
  };
}

export function resolveOrchestratorOperatorSeams(
  core: CatsCoreState,
  channelId: string,
): OrchestratorOperatorSeams {
  return buildOrchestratorOperatorSeams(core, channelId);
}

function buildExecutionLoopContract(
  channel: ChatChannelView,
  initialTargetCount: number,
  trigger: RoomRoutingTrigger,
): OrchestratorExecutionLoopContract {
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  return {
    planner: 'dynamic_room_workflow',
    dispatchBoundary: 'direct_runtime_api',
    initialShape: initialTargetCount === 0 ? 'blocked' : workflowShapeForTargets(initialTargetCount),
    initialStageId: workflowStageIdForTrigger(trigger),
    supportsReplan: true,
    guardrails: {
      maxContinuations: roomRouting.maxContinuations,
      maxDispatchesPerTurn: roomRouting.maxDispatchesPerTurn,
      maxTargetVisitsPerTurn: roomRouting.maxTargetVisitsPerTurn,
    },
  };
}

function buildOrchestratorParticipantPlan(
  state: ChatState,
  channelContext: OrchestratorPlannerChannelContext,
): OrchestratorParticipantPlan {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: resolveOrchestratorDisplayName(state),
    roles: [...channelContext.channel.orchestratorRoles],
    assignmentStatus: 'active',
    executionTarget: structuredClone(state.globalOrchestrator.executionTarget),
    lease: structuredClone(channelContext.channel.orchestratorLease),
    skillProfile: state.globalOrchestrator.skillProfile,
    mcpProfile: state.globalOrchestrator.mcpProfile,
    runtimeSkills: resolveSkillProfileManifest({
      profileId: state.globalOrchestrator.skillProfile,
      roomMode: channelContext.channel.roomRouting?.mode ?? 'boss_chat',
      transport: channelContext.transport,
      labels: ['participant:orchestrator'],
      metadata: {
        channelId: channelContext.channel.id,
      },
    }) ?? null,
    toolIntent: resolveToolIntentManifest({
      profileId: state.globalOrchestrator.mcpProfile,
      participantKind: 'orchestrator',
      channelId: channelContext.channel.id,
      roomMode: channelContext.channel.roomRouting?.mode ?? 'boss_chat',
      transport: channelContext.transport,
    }) ?? null,
  };
}

function buildCatParticipantPlan(
  channelContext: OrchestratorPlannerChannelContext,
  cat: ChatChannelCat,
): OrchestratorParticipantPlan {
  return {
    participantKind: 'cat',
    participantId: cat.catId,
    participantName: cat.name,
    roles: [...cat.roles],
    assignmentStatus: cat.status,
    executionTarget: structuredClone(cat.execution.target),
    lease: structuredClone(cat.execution.lease),
    skillProfile: cat.skillProfile,
    mcpProfile: cat.mcpProfile,
    runtimeSkills: resolveSkillProfileManifest({
      profileId: cat.skillProfile,
      catId: cat.catId,
      roomMode: channelContext.channel.roomRouting?.mode ?? 'boss_chat',
      transport: channelContext.transport,
      labels: ['participant:cat'],
      metadata: {
        channelId: channelContext.channel.id,
        catName: cat.name,
      },
    }) ?? null,
    toolIntent: resolveToolIntentManifest({
      profileId: cat.mcpProfile,
      participantKind: 'cat',
      channelId: channelContext.channel.id,
      catId: cat.catId,
      roomMode: channelContext.channel.roomRouting?.mode ?? 'boss_chat',
      transport: channelContext.transport,
    }) ?? null,
  };
}

function buildInitialTargetPlan(
  channelContext: OrchestratorPlannerChannelContext,
  participants: OrchestratorParticipantPlan[],
  target: RoomRoutingParticipantRef & { sessionId: string | null },
  trigger: RoomRoutingTrigger,
): OrchestratorDispatchTargetPlan {
  const participant = participants.find((candidate) =>
    candidate.participantKind === target.participantKind
      && candidate.participantId === target.participantId,
  );

  return {
    targetKind: target.participantKind,
    targetId: target.participantId,
    targetName: target.participantName,
    sessionId: target.sessionId,
    trigger,
    plannedDepth: 0,
    branchStrategy: 'fresh_no_parent',
    handoffReason: resolveWorkflowHandoffReason(trigger),
    skillProfile: participant?.skillProfile ?? null,
    mcpProfile: participant?.mcpProfile ?? null,
    runtimeSkills: participant?.runtimeSkills ?? null,
    toolIntent: participant?.toolIntent ?? null,
  };
}

export function buildOrchestratorTurnPlan(
  state: ChatState,
  core: CatsCoreState,
  input: OrchestratorPlanRequest,
): OrchestratorTurnPlan {
  const channel = buildChannelView(state, input.channelId);
  const transport = resolveTransport(input.transport);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const resolution = resolveMentionRoute(
    state,
    channel.id,
    input.body,
    {
      allowDefaultTarget: true,
      explicitTrigger: 'explicit_mention',
    },
  );
  const channelContext: OrchestratorPlannerChannelContext = {
    channel,
    transport,
  };
  const participants: OrchestratorParticipantPlan[] = [
    buildOrchestratorParticipantPlan(state, channelContext),
    ...channel.assignedCats.map((cat) => buildCatParticipantPlan(channelContext, cat)),
  ];

  return {
    planId: `orch-plan-${randomUUID()}`,
    snapshot: 'pre_dispatch',
    channelId: channel.id,
    channelTitle: channel.title,
    roomMode: roomRouting.mode,
    source: {
      body: input.body,
      senderName: input.senderName?.trim() || 'User',
      transport,
    },
    roomCapabilityHints: {
      skillProfile: channel.skillProfile,
      mcpProfile: channel.mcpProfile,
    },
    routing: {
      trigger: resolution.trigger,
      resolution: structuredClone(resolution.resolution),
      mentionNames: [...resolution.parsedMentionNames],
      unresolvedMentions: [...resolution.unresolvedMentions],
      initialTargets: resolution.targets.map((target) =>
        buildInitialTargetPlan(channelContext, participants, target, resolution.trigger),
      ),
    },
    participants,
    executionLoop: buildExecutionLoopContract(
      channel,
      resolution.targets.length,
      resolution.trigger,
    ),
  };
}

export function buildOrchestratorExecutionLoopSnapshot(
  core: CatsCoreState,
  channelId: string,
  runId?: string | null,
): OrchestratorExecutionLoopSnapshot {
  const operator = buildChatOperatorView(buildOperatorSnapshot(core), channelId);
  return {
    channelId,
    operator,
    runInspector: buildRunInspectorView(operator, runId),
  };
}

export function buildOrchestratorPlanResponse(
  state: ChatState,
  core: CatsCoreState,
  input: OrchestratorPlanRequest,
): OrchestratorPlanResponse {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(core, input.channelId),
    plan: buildOrchestratorTurnPlan(state, core, input),
  };
}

export function buildOrchestratorExecutionLoopResponse(
  core: CatsCoreState,
  channelId: string,
  runId?: string | null,
): OrchestratorExecutionLoopResponse {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(core, channelId),
    executionLoop: buildOrchestratorExecutionLoopSnapshot(core, channelId, runId),
  };
}
