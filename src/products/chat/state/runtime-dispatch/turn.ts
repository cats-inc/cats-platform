import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type { CatsCoreState } from '../../../../core/types.js';
import type {
  ProviderAgentBoundedObservation,
} from '../../../../platform/orchestration/index.js';
import {
  decideSupervisionPolicy,
  resolveProviderCapabilityProfile,
  type ProviderCapabilityBootstrapConfig,
  type ProviderCapabilityBootstrapDiagnosticSink,
  type SupervisionPolicy,
} from '../../../../platform/supervision/index.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
  RoomWorkflowShape,
} from '../../../../shared/roomRouting.js';
import {
  appendMessage,
  buildChannelView,
  requireChannel,
  resolveChannelCanonicalIdentity,
} from '../model/index.js';
import { buildCanonicalChatUserMessage } from '../chatCoreInterop.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../room-routing/index.js';
import {
  detachRoutingTargetRuntimeAttachment,
  detachRoutingTargetsRuntimeAttachments,
  mergeUnresolvedMentions,
  preseedWorkflowTurnTargets,
  resolveWorkflowBranchStrategy,
  resolveWorkflowHandoffReason,
  resolveTargets,
  type TargetResolution,
  workflowShapeForTargets,
  workflowStageIdForTrigger,
} from '../room-routing/runtime.js';
import {
  addWorkflowCheckpoint,
  appendWorkflowEvent,
  createRoutingOutcome,
  createWorkflowEvent,
  createWorkflowTurn,
  finalizeWorkflowTurn,
} from '../room-routing/workflow.js';
import {
  resolveChoiceResponseTarget,
  resolveExecutionMetadataForTarget,
  resolveOrchestratorExecutionTarget,
  type RuntimeTransportContext,
} from '../runtimeTargeting.js';
import {
  CHAT_PROVIDER_AGENT_DECISION_TOOL,
  buildChatProviderAgentObservation,
  createChatProviderAgentDecisionManifest,
} from '../providerAgentObservation.js';
import {
  createCatProductIntentProposalToolManifest,
} from '../../shared/catProductIntentProposal.js';
import {
  WORK_EXTERNAL_LINK_ISSUE_TOOL,
  WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
  WORK_ITEM_UPDATE_TOOL,
  WORK_PROJECT_CREATE_TOOL,
  createPhaseScopedWorkToolManifests,
  type PhaseScopedWorkToolName,
  type WorkToolCapabilityProfile,
} from '../../../work/shared/workToolSurface.js';
import {
  createPhaseScopedWorkToolObservation,
} from '../../../work/shared/workToolObservation.js';
import {
  resolveWorkExecutionPreparationPhase,
} from '../../../work/shared/workExecutionPreparationPhase.js';
import {
  resolveWorkExternalBindingPhase,
} from '../../../work/shared/workExternalBindingPhase.js';
import {
  resolveEffectiveChatNaturalProductIntentMode,
  type ChatNaturalProductIntentMode,
} from '../../shared/naturalProductIntentMode.js';
import {
  applyRoomRoutingSnapshot,
  toParticipantRef,
} from '../runtime-session/state.js';
import { resolveCurrentTurnRecipientTargets } from '../mentionRouter.js';
import { buildChatWorkIntakeSourceContext } from '../workIntakeSourceContext.js';
import type { DeterministicChatRoutingPlan } from './deterministicPlan.js';

const WORK_EXECUTION_PREPARATION_VISIBLE_STATUSES = new Set([
  'draft',
  'planned',
  'ready',
  'blocked',
]);
const MAX_WORK_EXECUTION_PREPARATION_VISIBLE_ITEMS = 20;
const WORK_TRIAGE_WORK_ITEM_ID_PATTERN = /\bwork-item-[a-z0-9][a-z0-9_-]*\b/gu;
const WORK_TRIAGE_PROJECT_ID_PATTERN = /\bproject-[a-z0-9][a-z0-9_-]*\b/gu;
const WORK_PROJECT_CREATE_CUE_PATTERN =
  /\b(create|add|new)\s+(a\s+)?project\b|\bproject\s+(create|add|new)\b|建立專案|新增專案/iu;
const WORK_ITEM_UPDATE_CUE_PATTERN =
  /\b(update|change|edit|rename|mark|set)\b|修改|更新|改成|標記/iu;

function readRequestedWorkflowShape(
  payload: SendChannelMessageInput,
): RoomWorkflowShape | null {
  const value = payload.messageMetadata?.workflowShape;
  // Keep accepting the legacy "parallel" alias from older API/replay payloads.
  if (value === 'parallel') {
    return 'concurrent';
  }
  return value === 'sequential' || value === 'concurrent' || value === 'converge'
    ? value
    : null;
}

function readRecipientParticipantIds(
  state: ChatState,
  payload: SendChannelMessageInput,
): string[] {
  const candidateIds = payload.messageMetadata?.recipientParticipantIds;
  const recipientIds = Array.isArray(candidateIds)
    ? candidateIds.filter((candidateId): candidateId is string => typeof candidateId === 'string')
    : [];
  const maxAudienceParticipants = state.capabilities.maxAudienceParticipants ?? Number.POSITIVE_INFINITY;
  return recipientIds.slice(0, maxAudienceParticipants);
}

export interface PreparedDispatchTurn {
  state: ChatState;
  results: ChannelDispatchResult[];
  userMessage: ChatMessage;
  initialResolution: TargetResolution;
  nowIso: string;
  baseRoomRouting: RoomRoutingState;
  workflow: RoomWorkflowState;
  activeTurn: RoomWorkflowTurn;
  outcome: RoomRoutingOutcome;
  latestCheckpoint: RoomRoutingCheckpoint | null;
  maxContinuations: number;
  maxDispatches: number;
  maxTargetVisits: number;
  providerAgentObservation: ProviderAgentBoundedObservation | null;
  terminalResult: { state: ChatState; results: ChannelDispatchResult[] } | null;
}

export interface PrepareDispatchTurnOptions {
  deterministicRoutingPlan?: DeterministicChatRoutingPlan | null;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
}

function resolveDeterministicPlanInitialResolution(
  plan: DeterministicChatRoutingPlan | null | undefined,
  channelId: string,
): TargetResolution | null {
  if (!plan || plan.channelId !== channelId) {
    return null;
  }

  return {
    targets: plan.routing.initialTargets.map((target) => ({
      participantKind: target.participantKind,
      participantId: target.participantId,
      participantName: target.participantName,
      laneId: target.laneId,
      sessionId: target.sessionId,
    })),
    unresolved: [...plan.routing.unresolvedMentions],
    mentionNames: [...plan.routing.mentionNames],
    trigger: plan.routing.trigger,
    resolution: structuredClone(plan.routing.resolution),
  };
}

export function prepareDispatchTurnForUserMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  userMessage: ChatMessage,
  now: Date,
  core?: CatsCoreState,
  options: PrepareDispatchTurnOptions = {},
): PreparedDispatchTurn {
  let nextState = state;
  const channelAfterUserMessage = buildChannelView(nextState, channelId);
  const choiceResponseTarget = payload.choiceResponse
    ? resolveChoiceResponseTarget(
        nextState,
        channelAfterUserMessage,
        payload.choiceResponse.sourceMessageId,
        core,
      )
    : null;
  const deterministicPlanResolution = !choiceResponseTarget
    ? resolveDeterministicPlanInitialResolution(options.deterministicRoutingPlan, channelId)
    : null;
  let initialResolution = choiceResponseTarget
    ? {
        targets: [detachRoutingTargetRuntimeAttachment(choiceResponseTarget)],
        unresolved: [],
        mentionNames: [],
        trigger: 'room_default' as const,
        resolution: {
          routingMode: 'room_default' as const,
          selectionKind: 'default_target' as const,
          defaultTarget: toParticipantRef(choiceResponseTarget),
          defaultTargetReason: null,
          fallbackTarget: null,
          blockedReason: null,
          note: 'Structured choice response routed back to the originating participant.',
        },
      }
    : deterministicPlanResolution ?? resolveTargets(nextState, channelId, payload.body, {
        allowDefaultTarget: true,
        explicitTrigger: 'explicit_mention',
      });
  const currentTurnRecipientIds = choiceResponseTarget ? [] : readRecipientParticipantIds(nextState, payload);
  if (
    !choiceResponseTarget
    && initialResolution.trigger === 'room_default'
    && currentTurnRecipientIds.length > 0
  ) {
    const currentTurnTargets = resolveCurrentTurnRecipientTargets(
      nextState,
      channelId,
      currentTurnRecipientIds,
    );
    if (currentTurnTargets.length > 0) {
      initialResolution = {
        ...initialResolution,
        targets: detachRoutingTargetsRuntimeAttachments(currentTurnTargets),
      };
    }
  }
  const results: ChannelDispatchResult[] = [];
  const nowIso = now.toISOString();
  const providerAgentObservation = buildProviderAgentObservationForTurn({
    state: nextState,
    channelId,
    payload,
    userMessage,
    initialResolution,
    nowIso,
    core,
    providerCapabilityBootstrapConfig: options.providerCapabilityBootstrapConfig,
    providerCapabilityBootstrapDiagnosticSink: options.providerCapabilityBootstrapDiagnosticSink,
    naturalProductIntentMode: options.naturalProductIntentMode,
    transport: options.transport,
    transportBindingId: options.transportBindingId,
  });
  const channelRouting = requireChannel(nextState, channelId).roomRouting;
  const baseRoomRouting = resolveRoomRoutingState(channelRouting);
  const workflow = resolveRoomWorkflowState(baseRoomRouting.workflow);
  const maxContinuations =
    baseRoomRouting.maxContinuations ?? DEFAULT_MAX_ROUTING_CONTINUATIONS;
  const maxDispatches =
    baseRoomRouting.maxDispatchesPerTurn ?? DEFAULT_MAX_ROUTING_DISPATCHES;
  const maxTargetVisits =
    baseRoomRouting.maxTargetVisitsPerTurn ?? DEFAULT_MAX_ROUTING_TARGET_VISITS;
  const outcome = createRoutingOutcome(channelAfterUserMessage, userMessage, initialResolution, nowIso);
  const activeTurn = createWorkflowTurn(
    userMessage,
    nowIso,
    workflowStageIdForTrigger(initialResolution.trigger),
    readRequestedWorkflowShape(payload)
      ?? workflowShapeForTargets(initialResolution.targets.length),
  );
  activeTurn.id = outcome.turnId;
  const preseededTargets = preseedWorkflowTurnTargets(activeTurn.id, initialResolution.targets);
  initialResolution = {
    ...initialResolution,
    targets: preseededTargets.map(({ target }) => target),
  };
  workflow.activeTurn = activeTurn;
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System routing started a new room turn.',
      nowIso,
      null,
      userMessage.id,
      initialResolution.targets.map((target) => toParticipantRef(target)),
      {
        targetIdentities: initialResolution.targets.map((target) => ({
          participantKind: target.participantKind,
          participantId: target.participantId,
          laneId: target.laneId ?? null,
          sessionId: target.sessionId ?? null,
        })),
        metadata: {
          trigger: initialResolution.trigger,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          selectionKind: initialResolution.resolution.selectionKind,
          defaultTargetReason: initialResolution.resolution.defaultTargetReason,
          blockedReason: initialResolution.resolution.blockedReason,
          unresolvedMentions: structuredClone(initialResolution.unresolved),
        },
      },
    ),
  );
  let latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'turn_started',
    'System routing started a new room turn.',
    nowIso,
    null,
    initialResolution.targets.map((target) => toParticipantRef(target)),
    {
      targetIdentities: initialResolution.targets.map((target) => ({
        participantKind: target.participantKind,
        participantId: target.participantId,
        laneId: target.laneId ?? null,
        sessionId: target.sessionId ?? null,
      })),
    },
  );
  activeTurn.targetStatuses = preseededTargets.map(({ target, targetStateId }) => ({
    id: targetStateId,
    dispatchId: null,
    participant: toParticipantRef(target),
    laneId: target.laneId ?? null,
    sessionId: target.sessionId ?? null,
    source: null,
    sourceMessageId: userMessage.id,
    sourceTurnId: null,
    sourceLaneId: null,
    sourceAssistantTurnId: null,
    trigger: initialResolution.trigger,
    mentionNames: structuredClone(initialResolution.mentionNames),
    depth: 0,
    parentCheckpointId: latestCheckpoint?.id ?? null,
    branchStrategy: resolveWorkflowBranchStrategy(null, target, 0),
    handoffReason: resolveWorkflowHandoffReason(initialResolution.trigger),
    wakeRequestId: null,
    status: 'pending',
    queuedAt: nowIso,
    startedAt: null,
    completedAt: null,
    response: null,
    error: null,
  }));

  if (initialResolution.unresolved.length > 0) {
    mergeUnresolvedMentions(outcome, initialResolution.unresolved);
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: `Unresolved mentions: ${initialResolution.unresolved.map((item) => `@${item}`).join(', ')}`,
      },
      now,
      {
        metadata: {
          event: 'unresolved_mentions',
          mentions: initialResolution.unresolved,
        },
      },
    ).state;
  }

  if (initialResolution.targets.length === 0) {
    const blockedTargets = outcome.resolution.defaultTarget
      ? [outcome.resolution.defaultTarget]
      : [];
    const blockedNote = outcome.resolution.note
      ?? 'No routing targets matched this message. Mention someone or let the room default target handle it.';
    latestCheckpoint = addWorkflowCheckpoint(
      outcome,
      workflow,
      activeTurn,
      'no_targets',
      blockedNote,
      nowIso,
      null,
      blockedTargets,
    );
    outcome.status = 'blocked';
    outcome.completedAt = nowIso;
    activeTurn.status = 'blocked';
    activeTurn.stageId = 'blocked';
    activeTurn.completedAt = nowIso;
    activeTurn.updatedAt = nowIso;
    nextState = appendMessage(
      nextState,
      channelId,
      {
        senderKind: 'system',
        senderName: 'Chat',
        body: blockedNote,
      },
      now,
      {
        metadata: {
          event: 'routing_skipped',
          blockedReason: outcome.resolution.blockedReason,
          selectionKind: outcome.resolution.selectionKind,
        },
      },
    ).state;
    appendWorkflowEvent(
      workflow,
      activeTurn,
      createWorkflowEvent(
        activeTurn.id,
        'outcome',
        'blocked',
        blockedNote,
        nowIso,
        null,
        userMessage.id,
        blockedTargets,
        {
          outcomeId: randomUUID(),
          targetIdentities: initialResolution.targets.map((target) => ({
            participantKind: target.participantKind,
            participantId: target.participantId,
            laneId: target.laneId ?? null,
            sessionId: target.sessionId ?? null,
          })),
          metadata: {
            workflowStageId: activeTurn.stageId,
            workflowShape: activeTurn.workflowShape,
            status: 'blocked',
            blockedReason: outcome.resolution.blockedReason,
          },
        },
      ),
    );
    finalizeWorkflowTurn(workflow, activeTurn);
    nextState = applyRoomRoutingSnapshot(
      nextState,
      channelId,
      baseRoomRouting,
      workflow,
      outcome,
      latestCheckpoint,
      now,
    );
    return {
      state: nextState,
      results,
      userMessage,
      initialResolution,
      nowIso,
      baseRoomRouting,
      workflow,
      activeTurn,
      outcome,
      latestCheckpoint,
      maxContinuations,
      maxDispatches,
      maxTargetVisits,
      providerAgentObservation,
      terminalResult: {
        state: nextState,
        results,
      },
    };
  }

  return {
    state: nextState,
    results,
    userMessage,
    initialResolution,
    nowIso,
    baseRoomRouting,
    workflow,
    activeTurn,
    outcome,
    latestCheckpoint,
    maxContinuations,
    maxDispatches,
    maxTargetVisits,
    providerAgentObservation,
    terminalResult: null,
  };
}

function buildProviderAgentObservationForTurn(input: {
  state: ChatState;
  channelId: string;
  payload: SendChannelMessageInput;
  userMessage: ChatMessage;
  initialResolution: TargetResolution;
  nowIso: string;
  core?: CatsCoreState;
  providerCapabilityBootstrapConfig?: ProviderCapabilityBootstrapConfig | null;
  providerCapabilityBootstrapDiagnosticSink?: ProviderCapabilityBootstrapDiagnosticSink;
  naturalProductIntentMode?: ChatNaturalProductIntentMode;
  transport?: RuntimeTransportContext;
  transportBindingId?: string | null;
}): ProviderAgentBoundedObservation | null {
  const channel = requireChannel(input.state, input.channelId);
  const singleTarget = input.initialResolution.targets.length === 1
    ? input.initialResolution.targets[0]!
    : null;
  const singleCatTarget = singleTarget?.participantKind === 'cat' ? singleTarget : null;
  const executionTarget = singleCatTarget
    ? resolveExecutionMetadataForTarget(input.state, input.channelId, singleCatTarget)
    : resolveOrchestratorExecutionTarget(input.state, channel);
  const capabilityProfile = resolveProviderCapabilityProfile(
    {
      provider: executionTarget.provider ?? 'unknown',
      instance: executionTarget.instance,
      model: executionTarget.model,
      modelSelection: executionTarget.modelSelection ?? null,
    },
    {
      assessedAt: input.nowIso,
      bootstrapConfig: input.providerCapabilityBootstrapConfig,
    },
  );
  input.providerCapabilityBootstrapDiagnosticSink?.emitMany(capabilityProfile.diagnostics);
  const policyDecision = decideSupervisionPolicy({
    actionId: `${input.userMessage.id}:provider-agent-observation`,
    runId: `chat:${input.channelId}`,
    actorRef: 'orchestrator',
    targetRef: CHAT_PROVIDER_AGENT_DECISION_TOOL,
    providerRef: capabilityProfile.profileId,
    actionType: 'chat_turn_semantic_decision',
    evaluatedAt: input.nowIso,
    capabilityAssessment: capabilityProfile.assessment,
    toolManifest: createChatProviderAgentDecisionManifest(),
  });

  if (policyDecision.status !== 'applied') {
    return null;
  }
  const providerAgentActorRef = singleCatTarget
    ? `cat:${singleCatTarget.participantId}`
    : 'orchestrator';
  const exposeCatProductIntentProposalTool = shouldExposeCatProductIntentProposalTool({
    channel,
    core: input.core,
    capabilityProfileKind: capabilityProfile.kind,
    naturalProductIntentMode: input.naturalProductIntentMode,
    hasSingleCatTarget: Boolean(singleCatTarget),
  });
  const workIntakeToolObservation = createWorkIntakeToolObservation({
    enabled: exposeCatProductIntentProposalTool,
    capabilityProfileKind: capabilityProfile.kind,
    policy: policyDecision.result.policy,
  });
  const workIntakeSourceContext = buildChatWorkIntakeSourceContext({
    state: input.state,
    channelId: input.channelId,
    message: input.userMessage,
    transport: input.transport,
    transportBindingId: input.transportBindingId,
  });
  const visibleExecutionPreparationWorkItemIds = resolveVisibleWorkItemIdsForExecutionPreparation({
    state: input.state,
    channelId: input.channelId,
    core: input.core,
  });
  const workExecutionPreparationPhase = resolveWorkExecutionPreparationPhase({
    rawText: input.payload.body,
    addressedBossCat: isSingleBossCatTarget(input.state, singleCatTarget),
    activeWorkItemIds: readActiveWorkItemIdsFromMessage(input.userMessage),
    visibleWorkItemIds: visibleExecutionPreparationWorkItemIds,
  });
  const workExecutionPreparationToolObservation = createWorkExecutionPreparationToolObservation({
    enabled: workExecutionPreparationPhase.kind === 'matched'
      && isSingleBossCatTarget(input.state, singleCatTarget)
      && Boolean(input.core),
    policy: policyDecision.result.policy,
  });
  const workExecutionPreparationContextRefs =
    workExecutionPreparationPhase.kind === 'matched'
      && workExecutionPreparationToolObservation.descriptors.length > 0
      ? [
        `work-execution-preparation-phase:${workExecutionPreparationPhase.phase}`,
        `work-execution-preparation-scope:${workExecutionPreparationPhase.scope}`,
        ...workExecutionPreparationPhase.workItemRefs.map((workItemId) =>
          `work-execution-preparation-work-item:${workItemId}`),
      ]
      : [];
  const workExternalBindingPhase = resolveWorkExternalBindingPhase({
    rawText: input.payload.body,
  });
  const workExternalBindingPolicyDecision = workExternalBindingPhase.kind === 'matched'
    ? decideSupervisionPolicy({
        actionId: `${input.userMessage.id}:work-external-binding-observation`,
        runId: `chat:${input.channelId}`,
        actorRef: providerAgentActorRef,
        targetRef: workExternalBindingPhase.operation === 'link'
          ? WORK_EXTERNAL_LINK_ISSUE_TOOL
          : WORK_EXTERNAL_UNLINK_ISSUE_TOOL,
        providerRef: capabilityProfile.profileId,
        actionType: 'work_external_tracker_binding',
        evaluatedAt: input.nowIso,
        capabilityAssessment: capabilityProfile.assessment,
        toolManifest: findWorkExternalBindingManifest(workExternalBindingPhase.operation),
      })
    : null;
  const workExternalBindingToolObservation = createWorkExternalBindingToolObservation({
    enabled: workExternalBindingPhase.kind === 'matched'
      && Boolean(input.core)
      && workExternalBindingPolicyDecision?.status === 'applied',
    capabilityProfileKind: capabilityProfile.kind,
    policy: workExternalBindingPolicyDecision?.status === 'applied'
      ? workExternalBindingPolicyDecision.result.policy
      : policyDecision.result.policy,
  });
  const workExternalBindingContextRefs =
    workExternalBindingPhase.kind === 'matched'
      && workExternalBindingToolObservation.descriptors.length > 0
      ? [
        `work-external-binding-phase:${workExternalBindingPhase.phase}`,
        `work-external-binding-operation:${workExternalBindingPhase.operation}`,
        `work-external-binding-local-kind:${workExternalBindingPhase.localKind}`,
        `work-external-binding-local-id:${workExternalBindingPhase.localId}`,
        `work-external-binding-provider:${workExternalBindingPhase.external.provider}`,
        `work-external-binding-external-type:${
          workExternalBindingPhase.external.externalType ?? 'issue'
        }`,
        `work-external-binding-external-id:${workExternalBindingPhase.external.externalId}`,
      ]
      : [];
  const workTriageContextRefs = workExternalBindingPhase.kind === 'matched'
    ? []
    : resolveWorkTriageContextRefs(input.payload.body);
  const workTriageToolObservation = createWorkTriageToolObservation({
    enabled: workTriageContextRefs.length > 0 && Boolean(input.core),
    capabilityProfileKind: capabilityProfile.kind,
    policy: policyDecision.result.policy,
  });
  const workTriageObservationContextRefs =
    workTriageToolObservation.descriptors.length > 0
      ? [
        'work-triage-phase:triage',
        ...workTriageContextRefs,
      ]
      : [];
  const workProjectCreateMatched = resolveWorkProjectCreateCue(input.payload.body);
  const workProjectCreatePolicyDecision = workProjectCreateMatched
    ? decideSupervisionPolicy({
        actionId: `${input.userMessage.id}:work-project-create-observation`,
        runId: `chat:${input.channelId}`,
        actorRef: providerAgentActorRef,
        targetRef: WORK_PROJECT_CREATE_TOOL,
        providerRef: capabilityProfile.profileId,
        actionType: 'work_project_create',
        evaluatedAt: input.nowIso,
        capabilityAssessment: capabilityProfile.assessment,
        toolManifest: findPhaseScopedWorkToolManifest(WORK_PROJECT_CREATE_TOOL),
      })
    : null;
  const workProjectCreateToolObservation = createFilteredWorkToolObservation({
    enabled: workProjectCreateMatched
      && Boolean(input.core)
      && workProjectCreatePolicyDecision?.status === 'applied',
    phase: 'triage',
    capabilityProfileKind: capabilityProfile.kind,
    policy: workProjectCreatePolicyDecision?.status === 'applied'
      ? workProjectCreatePolicyDecision.result.policy
      : policyDecision.result.policy,
    toolNames: [WORK_PROJECT_CREATE_TOOL],
  });
  const workProjectCreateContextRefs =
    workProjectCreateToolObservation.descriptors.length > 0
      ? [
        'work-triage-phase:triage',
        'work-triage-action:create_project',
      ]
      : [];
  const workItemUpdateContextRefs = resolveWorkItemUpdateContextRefs(input.payload.body);
  const workItemUpdatePolicyDecision = workItemUpdateContextRefs.length > 0
    ? decideSupervisionPolicy({
        actionId: `${input.userMessage.id}:work-item-update-observation`,
        runId: `chat:${input.channelId}`,
        actorRef: providerAgentActorRef,
        targetRef: WORK_ITEM_UPDATE_TOOL,
        providerRef: capabilityProfile.profileId,
        actionType: 'work_item_update',
        evaluatedAt: input.nowIso,
        capabilityAssessment: capabilityProfile.assessment,
        toolManifest: findPhaseScopedWorkToolManifest(WORK_ITEM_UPDATE_TOOL),
      })
    : null;
  const workItemUpdateToolObservation = createFilteredWorkToolObservation({
    enabled: workItemUpdateContextRefs.length > 0
      && Boolean(input.core)
      && workItemUpdatePolicyDecision?.status === 'applied',
    phase: 'triage',
    capabilityProfileKind: capabilityProfile.kind,
    policy: workItemUpdatePolicyDecision?.status === 'applied'
      ? workItemUpdatePolicyDecision.result.policy
      : policyDecision.result.policy,
    toolNames: [WORK_ITEM_UPDATE_TOOL],
  });
  const workItemUpdateObservationContextRefs =
    workItemUpdateToolObservation.descriptors.length > 0
      ? [
        'work-triage-phase:triage',
        'work-triage-action:update_work_item',
        ...workItemUpdateContextRefs,
      ]
      : [];
  const observationPolicy = workExternalBindingPolicyDecision?.status === 'applied'
    && workExternalBindingToolObservation.descriptors.length > 0
    ? workExternalBindingPolicyDecision.result.policy
    : workProjectCreatePolicyDecision?.status === 'applied'
      && workProjectCreateToolObservation.descriptors.length > 0
        ? workProjectCreatePolicyDecision.result.policy
        : workItemUpdatePolicyDecision?.status === 'applied'
          && workItemUpdateToolObservation.descriptors.length > 0
            ? workItemUpdatePolicyDecision.result.policy
            : policyDecision.result.policy;

  return buildChatProviderAgentObservation({
    state: input.state,
    channelId: input.channelId,
    actorRef: providerAgentActorRef,
    capabilityProfile,
    policy: observationPolicy,
    availableTools: [
      ...(exposeCatProductIntentProposalTool
        ? [
          {
            manifest: createCatProductIntentProposalToolManifest(),
            reason: 'Strong Cat can ask the owner to confirm Work/Code intake.',
          },
        ]
        : []),
      ...workIntakeToolObservation.descriptors,
      ...workExecutionPreparationToolObservation.descriptors,
      ...workExternalBindingToolObservation.descriptors,
      ...workTriageToolObservation.descriptors,
      ...workProjectCreateToolObservation.descriptors,
      ...workItemUpdateToolObservation.descriptors,
    ],
    additionalContextRefs: [
      ...workIntakeSourceContext.contextRefs,
      ...workExecutionPreparationContextRefs,
      ...workExternalBindingContextRefs,
      ...workTriageObservationContextRefs,
      ...workProjectCreateContextRefs,
      ...workItemUpdateObservationContextRefs,
    ],
    invariants: [
      ...(exposeCatProductIntentProposalTool
        ? [
            'proposeProductIntake asks the owner to confirm Work/Code intake and must not be used for casual chat.',
            'If a proposal tool request is rejected or ignored by platform policy, continue ordinary chat without exposing internal rejection details to the owner.',
            'Do not request createWorkItem, createTask, or createRun in the same provider-agent decision as proposeProductIntake.',
            'At most one proposeProductIntake request can be accepted per assistant turn.',
          ]
        : []),
      ...workIntakeToolObservation.invariants,
      ...workExecutionPreparationToolObservation.invariants,
      ...workExternalBindingToolObservation.invariants,
      ...workTriageToolObservation.invariants,
      ...workProjectCreateToolObservation.invariants,
      ...workItemUpdateToolObservation.invariants,
    ],
    messageCharacterCount: input.payload.body.length,
    routing: {
      trigger: input.initialResolution.trigger,
      resolution: input.initialResolution.resolution,
      targetCount: input.initialResolution.targets.length,
      unresolvedCount: input.initialResolution.unresolved.length,
      mentionCount: input.initialResolution.mentionNames.length,
    },
    now: new Date(input.nowIso),
  });
}

function resolveWorkTriageContextRefs(rawText: string): string[] {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (!normalizedText || normalizedText.startsWith('/')) {
    return [];
  }

  return [
    ...uniqueNonEmptyStrings([...normalizedText.matchAll(WORK_TRIAGE_WORK_ITEM_ID_PATTERN)]
      .map((match) => match[0]))
      .map((workItemId) => `work-triage-work-item:${workItemId}`),
    ...uniqueNonEmptyStrings([...normalizedText.matchAll(WORK_TRIAGE_PROJECT_ID_PATTERN)]
      .map((match) => match[0]))
      .map((projectId) => `work-triage-project:${projectId}`),
  ];
}

function resolveWorkProjectCreateCue(rawText: string): boolean {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ');
  return Boolean(normalizedText)
    && !normalizedText.startsWith('/')
    && WORK_PROJECT_CREATE_CUE_PATTERN.test(normalizedText);
}

function resolveWorkItemUpdateContextRefs(rawText: string): string[] {
  const normalizedText = rawText.trim().replace(/\s+/gu, ' ').toLowerCase();
  if (
    !normalizedText
    || normalizedText.startsWith('/')
    || !WORK_ITEM_UPDATE_CUE_PATTERN.test(normalizedText)
  ) {
    return [];
  }

  return uniqueNonEmptyStrings([...normalizedText.matchAll(WORK_TRIAGE_WORK_ITEM_ID_PATTERN)]
    .map((match) => match[0]))
    .map((workItemId) => `work-triage-work-item:${workItemId}`);
}

function findWorkExternalBindingManifest(
  operation: 'link' | 'unlink',
): ReturnType<typeof createPhaseScopedWorkToolManifests>[number] {
  const toolName = operation === 'link'
    ? WORK_EXTERNAL_LINK_ISSUE_TOOL
    : WORK_EXTERNAL_UNLINK_ISSUE_TOOL;
  return findPhaseScopedWorkToolManifest(toolName);
}

function findPhaseScopedWorkToolManifest(
  toolName: PhaseScopedWorkToolName,
): ReturnType<typeof createPhaseScopedWorkToolManifests>[number] {
  const manifest = createPhaseScopedWorkToolManifests().find((candidate) =>
    candidate.name === toolName);
  if (!manifest) {
    throw new Error(`Missing Work tool manifest: ${toolName}`);
  }
  return manifest;
}

function createWorkIntakeToolObservation(input: {
  enabled: boolean;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  policy: SupervisionPolicy;
}): ReturnType<typeof createPhaseScopedWorkToolObservation> {
  const capabilityProfile = resolveWorkToolCapabilityProfile(input.capabilityProfileKind);
  return createPhaseScopedWorkToolObservation({
    enabled: input.enabled,
    phase: 'intake',
    capabilityProfile,
    parentToolScope: input.policy.toolScope,
    policyToolScope: input.policy.toolScope,
  });
}

function createWorkExecutionPreparationToolObservation(input: {
  enabled: boolean;
  policy: SupervisionPolicy;
}): ReturnType<typeof createPhaseScopedWorkToolObservation> {
  return createPhaseScopedWorkToolObservation({
    enabled: input.enabled,
    phase: 'execution_preparation',
    capabilityProfile: 'boss_cat',
    parentToolScope: input.policy.toolScope,
    policyToolScope: input.policy.toolScope,
  });
}

function createWorkTriageToolObservation(input: {
  enabled: boolean;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  policy: SupervisionPolicy;
}): ReturnType<typeof createPhaseScopedWorkToolObservation> {
  return createPhaseScopedWorkToolObservation({
    enabled: input.enabled,
    phase: 'triage',
    capabilityProfile: resolveWorkToolCapabilityProfile(input.capabilityProfileKind),
    parentToolScope: input.policy.toolScope,
    policyToolScope: input.policy.toolScope,
  });
}

function createFilteredWorkToolObservation(input: {
  enabled: boolean;
  phase: 'triage';
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  policy: SupervisionPolicy;
  toolNames: PhaseScopedWorkToolName[];
}): ReturnType<typeof createPhaseScopedWorkToolObservation> {
  const observation = createPhaseScopedWorkToolObservation({
    enabled: input.enabled,
    phase: input.phase,
    capabilityProfile: resolveWorkToolCapabilityProfile(input.capabilityProfileKind),
    parentToolScope: input.policy.toolScope,
    policyToolScope: input.policy.toolScope,
  });
  const allowedToolNames = new Set(input.toolNames);
  return {
    descriptors: observation.descriptors.filter((descriptor) =>
      allowedToolNames.has(descriptor.manifest.name as PhaseScopedWorkToolName)),
    invariants: observation.invariants,
  };
}

function createWorkExternalBindingToolObservation(input: {
  enabled: boolean;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  policy: SupervisionPolicy;
}): ReturnType<typeof createPhaseScopedWorkToolObservation> {
  return createPhaseScopedWorkToolObservation({
    enabled: input.enabled,
    phase: 'external_tracker_binding',
    capabilityProfile: resolveWorkToolCapabilityProfile(input.capabilityProfileKind),
    parentToolScope: input.policy.toolScope,
    policyToolScope: input.policy.toolScope,
  });
}

function resolveWorkToolCapabilityProfile(
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown',
): WorkToolCapabilityProfile {
  return capabilityProfileKind;
}

function isSingleBossCatTarget(
  state: ChatState,
  singleCatTarget: TargetResolution['targets'][number] | null,
): boolean {
  return Boolean(
    state.bossCatId
    && singleCatTarget
    && singleCatTarget.participantKind === 'cat'
    && singleCatTarget.participantId === state.bossCatId,
  );
}

function resolveVisibleWorkItemIdsForExecutionPreparation(input: {
  state: ChatState;
  channelId: string;
  core?: CatsCoreState;
}): string[] {
  if (!input.core) {
    return [];
  }

  const { conversationId } = resolveChannelCanonicalIdentity(input.state, input.channelId);
  return input.core.workItems
    .filter((workItem) =>
      workItem.conversationId === conversationId
      && WORK_EXECUTION_PREPARATION_VISIBLE_STATUSES.has(workItem.status)
      && workItem.taskId === null)
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, MAX_WORK_EXECUTION_PREPARATION_VISIBLE_ITEMS)
    .map((workItem) => workItem.id);
}

function readActiveWorkItemIdsFromMessage(message: ChatMessage): string[] {
  return uniqueNonEmptyStrings([
    readWorkItemIdFromMetadataRef(message.metadata.directSlashModeIntakeRef),
    readWorkItemIdFromMetadataRef(message.metadata.productIntentIntakeRef),
  ]);
}

function readWorkItemIdFromMetadataRef(value: unknown): string | null {
  if (!isRecord(value) || typeof value.workItemId !== 'string') {
    return null;
  }

  const normalized = value.workItemId.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// v1 narrowing: SPEC-107 §28 allows any addressed/active strong Cat in
// group/team presets to propose, but the current observation pipeline builds
// a single observation per turn keyed off `singleCatTarget`, with one
// capability profile. Exposing the proposal tool when multiple Cats are
// addressed would fall back to the orchestrator capability profile and risk
// bypassing the strong-agent gate. Until per-Cat observations land, this
// helper deliberately requires a single addressed Cat target. The one-
// proposal-per-turn invariant is enforced in `catProductIntentProposal`
// validation regardless. Tracked in PLAN-096 Progress Log (2026-05-09).
function shouldExposeCatProductIntentProposalTool(input: {
  channel: ReturnType<typeof requireChannel>;
  core: CatsCoreState | undefined;
  capabilityProfileKind: 'strong_agent' | 'weak_worker' | 'unknown';
  naturalProductIntentMode: ChatNaturalProductIntentMode | undefined;
  hasSingleCatTarget: boolean;
}): boolean {
  const effectiveMode = resolveEffectiveChatNaturalProductIntentMode({
    deploymentMode: input.naturalProductIntentMode,
    ownerEnabled: input.core?.ownerProfile.naturalProductIntentProposalsEnabled,
  });
  return effectiveMode === 'cat_tool'
    && input.hasSingleCatTarget
    && input.capabilityProfileKind === 'strong_agent';
}

function findChannelUserMessage(
  channel: ReturnType<typeof buildChannelView>,
  messageId: string,
  core?: CatsCoreState,
): ChatMessage {
  const userMessage = channel.messages.find((message) => message.id === messageId);
  const resolvedUserMessage = userMessage ?? (core
    ? buildCanonicalChatUserMessage(core, channel.id, messageId)
    : null);
  if (!resolvedUserMessage) {
    throw new Error(`Channel message not found: ${messageId}`);
  }
  if (resolvedUserMessage.senderKind !== 'user') {
    throw new Error(`Only user messages can seed a routed turn: ${messageId}`);
  }
  return resolvedUserMessage;
}

export function prepareDispatchTurn(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  now: Date,
  core?: CatsCoreState,
  options: PrepareDispatchTurnOptions = {},
): PreparedDispatchTurn {
  const channelAfterUserMessage = buildChannelView(state, channelId);
  const userMessage =
    channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  return prepareDispatchTurnForUserMessage(
    state,
    channelId,
    payload,
    userMessage,
    now,
    core,
    options,
  );
}

export function prepareDispatchTurnForExistingUserMessage(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  messageId: string,
  now: Date,
  core?: CatsCoreState,
  options: PrepareDispatchTurnOptions = {},
): PreparedDispatchTurn {
  const channel = buildChannelView(state, channelId);
  const userMessage = findChannelUserMessage(channel, messageId, core);
  return prepareDispatchTurnForUserMessage(
    state,
    channelId,
    payload,
    userMessage,
    now,
    core,
    options,
  );
}
