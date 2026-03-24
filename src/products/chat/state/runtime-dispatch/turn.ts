import { randomUUID } from 'node:crypto';

import type {
  ChannelDispatchResult,
  SendChannelMessageInput,
  ChatMessage,
  ChatState,
} from '../../api/contracts.js';
import type {
  RoomRoutingCheckpoint,
  RoomRoutingOutcome,
  RoomRoutingState,
  RoomWorkflowState,
  RoomWorkflowTurn,
} from '../../../../shared/roomRouting.js';
import {
  appendMessage,
  buildChannelView,
  requireChannel,
} from '../model.js';
import {
  DEFAULT_MAX_ROUTING_CONTINUATIONS,
  DEFAULT_MAX_ROUTING_DISPATCHES,
  DEFAULT_MAX_ROUTING_TARGET_VISITS,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../roomRouting.js';
import {
  mergeUnresolvedMentions,
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
import { resolveChoiceResponseTarget } from '../runtimeTargeting.js';
import {
  applyRoomRoutingSnapshot,
  toParticipantRef,
} from '../runtime-session/state.js';

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
  terminalResult: { state: ChatState; results: ChannelDispatchResult[] } | null;
}

export function prepareDispatchTurn(
  state: ChatState,
  channelId: string,
  payload: SendChannelMessageInput,
  now: Date,
): PreparedDispatchTurn {
  let nextState = state;
  const channelAfterUserMessage = buildChannelView(nextState, channelId);
  const userMessage = channelAfterUserMessage.messages[channelAfterUserMessage.messages.length - 1];
  const choiceResponseTarget = payload.choiceResponse
    ? resolveChoiceResponseTarget(
        nextState,
        channelAfterUserMessage,
        payload.choiceResponse.sourceMessageId,
      )
    : null;
  const initialResolution = choiceResponseTarget
    ? {
        targets: [choiceResponseTarget],
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
    : resolveTargets(nextState, channelId, payload.body, {
        allowDefaultTarget: true,
        explicitTrigger: 'explicit_mention',
      });
  const results: ChannelDispatchResult[] = [];
  const nowIso = now.toISOString();
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
    workflowShapeForTargets(initialResolution.targets.length),
  );
  activeTurn.id = outcome.turnId;
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
  );

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
    terminalResult: null,
  };
}
