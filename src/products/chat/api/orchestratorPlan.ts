import { randomUUID } from 'node:crypto';

import type {
  RoomRoutingParticipantRef,
  RoomRoutingTrigger,
} from '../../../shared/roomRouting.js';
import { resolveSkillProfileManifest } from '../../../shared/skillProfiles.js';
import type { CatsCoreState } from '../../../core/types.js';
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
  OrchestratorStateView,
  OrchestratorPlannerChannelContext,
  OrchestratorPlannerSurface,
} from '../../../platform/orchestration/contracts.js';
import { ORCHESTRATOR_CONTRACT_VERSION } from '../../../platform/orchestration/contracts.js';
import {
  buildExecutionPlanFromChannel,
  buildOrchestratorRuntimeToolPlane,
  buildPreDispatchExecutionPlan,
} from '../../../platform/orchestration/execution/index.js';
import { resolveToolIntentManifest } from '../../../platform/orchestration/toolIntent.js';

function resolveTransport(
  transport?: OrchestratorTransportContext,
): OrchestratorTransportContext {
  return transport ?? 'web';
}

function workflowShapeForTargets(targetCount: number) {
  return targetCount > 1 ? 'concurrent' : 'sequential';
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

function buildOrchestratorOperatorSeams<TState extends OrchestratorStateView>(
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface<TState>,
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

export function resolveOrchestratorOperatorSeams<TState extends OrchestratorStateView>(
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface<TState>,
): OrchestratorOperatorSeams {
  return buildOrchestratorOperatorSeams(core, channelId, plannerSurface);
}

function buildExecutionLoopContract<TState extends OrchestratorStateView>(
  channel: OrchestratorChannelView,
  initialTargetCount: number,
  trigger: RoomRoutingTrigger,
  plannerSurface: OrchestratorPlannerSurface<TState>,
): OrchestratorExecutionLoopContract {
  const roomRouting = plannerSurface.resolveRoomRoutingState(channel.roomRouting);
  return {
    planner: 'dynamic_room_workflow',
    dispatchBoundary: 'supervised_runtime_boundary',
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

function buildOrchestratorParticipantPlan<TState extends OrchestratorStateView>(
  state: TState,
  channelContext: OrchestratorPlannerChannelContext,
  plannerSurface: OrchestratorPlannerSurface<TState>,
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
  target: RoomRoutingParticipantRef & {
    laneId: string | null;
    sessionId: string | null;
  },
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
    laneId: target.laneId ?? participant?.lease.laneId ?? null,
    sessionId: target.sessionId ?? participant?.lease.sessionId ?? null,
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

export function buildOrchestratorTurnPlan<TState extends OrchestratorStateView>(
  state: TState,
  core: CatsCoreState,
  input: OrchestratorPlanRequest,
  plannerSurface: OrchestratorPlannerSurface<TState>,
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

export function buildOrchestratorExecutionLoopSnapshot<TState extends OrchestratorStateView>(
  state: TState,
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface<TState>,
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

export function buildOrchestratorPlanResponse<TState extends OrchestratorStateView>(
  state: TState,
  core: CatsCoreState,
  input: OrchestratorPlanRequest,
  plannerSurface: OrchestratorPlannerSurface<TState>,
): OrchestratorPlanResponse {
  return {
    contractVersion: ORCHESTRATOR_CONTRACT_VERSION,
    surface: 'direct_product_api',
    operator: resolveOrchestratorOperatorSeams(core, input.channelId, plannerSurface),
    plan: buildOrchestratorTurnPlan(state, core, input, plannerSurface),
  };
}

export function buildOrchestratorExecutionLoopResponse<TState extends OrchestratorStateView>(
  state: TState,
  core: CatsCoreState,
  channelId: string,
  plannerSurface: OrchestratorPlannerSurface<TState>,
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
