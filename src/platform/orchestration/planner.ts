import { randomUUID } from 'node:crypto';

import type {
  ChatState,
} from '../../shared/app-shell.js';
import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../shared/roomRouting.js';
import { resolveSkillProfileManifest } from '../../shared/skillProfiles.js';
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
  OrchestratorChannelCat,
  OrchestratorChannelView,
  OrchestratorPlannerChannelContext,
  OrchestratorPlannerSurface,
} from './contracts.js';
import { ORCHESTRATOR_CONTRACT_VERSION } from './contracts.js';
import {
  buildExecutionPlanFromChannel,
  buildOrchestratorRuntimeToolPlane,
  buildPreDispatchExecutionPlan,
} from './execution.js';
import { resolveToolIntentManifest } from './toolIntent.js';

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
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorOperatorSeams {
  const operatorView = plannerSurface.buildOperatorView(core, channelId);

  return {
    conversationId: operatorView?.conversationId ?? plannerSurface.resolveConversationId(channelId),
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
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorOperatorSeams {
  return buildOrchestratorOperatorSeams(core, channelId, plannerSurface);
}

function buildExecutionLoopContract(
  channel: OrchestratorChannelView,
  initialTargetCount: number,
  trigger: RoomRoutingTrigger,
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorExecutionLoopContract {
  const roomRouting = plannerSurface.resolveRoomRoutingState(channel.roomRouting);
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
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorParticipantPlan {
  return {
    participantKind: 'orchestrator',
    participantId: 'orchestrator',
    participantName: plannerSurface.resolveOrchestratorDisplayName(state),
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
  cat: OrchestratorChannelCat,
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
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorTurnPlan {
  const channel = plannerSurface.buildChannelView(state, input.channelId);
  const transport = resolveTransport(input.transport);
  const roomRouting = plannerSurface.resolveRoomRoutingState(channel.roomRouting);
  const resolution = plannerSurface.resolveMentionRoute(
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
    buildOrchestratorParticipantPlan(state, channelContext, plannerSurface),
    ...channel.assignedCats.map((cat) => buildCatParticipantPlan(channelContext, cat)),
  ];
  const planId = `orch-plan-${randomUUID()}`;
  const operatorSeams = resolveOrchestratorOperatorSeams(core, channel.id, plannerSurface);
  const executionLoop = buildExecutionLoopContract(
    channel,
    resolution.targets.length,
    resolution.trigger,
    plannerSurface,
  );
  const planBase = {
    planId,
    snapshot: 'pre_dispatch' as const,
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
    executionLoop,
  };

  return {
    ...planBase,
    runtimeToolPlane: buildOrchestratorRuntimeToolPlane(),
    execution: buildPreDispatchExecutionPlan(
      {
        planId,
        channelId: channel.id,
        sourceMessageId: null,
        initialStageId: executionLoop.initialStageId,
        initialShape: executionLoop.initialShape,
        initialTargets: planBase.routing.initialTargets,
        sourceBody: planBase.source.body,
        senderName: planBase.source.senderName,
        transport: planBase.source.transport,
      },
      core,
      operatorSeams,
    ),
  };
}

export function buildOrchestratorExecutionLoopSnapshot(
  state: ChatState,
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface,
  selection: {
    runId?: string | null;
    turnId?: string | null;
  } = {},
): OrchestratorExecutionLoopSnapshot {
  const operator = plannerSurface.buildOperatorView(core, channelId);
  const channel = plannerSurface.buildChannelView(state, channelId);
  const runInspector = plannerSurface.buildRunInspectorView(operator, selection.runId);
  return {
    channelId,
    runtimeToolPlane: buildOrchestratorRuntimeToolPlane(),
    execution: buildExecutionPlanFromChannel({
      channel,
      core,
      operatorSeams: resolveOrchestratorOperatorSeams(core, channelId, plannerSurface),
      runInspector,
      selection,
    }),
    operator,
    runInspector,
  };
}

export function buildOrchestratorPlanResponse(
  state: ChatState,
  core: CatsCoreState,
  input: OrchestratorPlanRequest,
  plannerSurface: OrchestratorPlannerSurface,
): OrchestratorPlanResponse {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(core, input.channelId, plannerSurface),
    plan: buildOrchestratorTurnPlan(state, core, input, plannerSurface),
  };
}

export function buildOrchestratorExecutionLoopResponse(
  state: ChatState,
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface,
  runId?: string | null,
): OrchestratorExecutionLoopResponse {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(core, channelId, plannerSurface),
    executionLoop: buildOrchestratorExecutionLoopSnapshot(
      state,
      core,
      channelId,
      plannerSurface,
      { runId },
    ),
  };
}
