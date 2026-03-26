import {
  appendWorkflowEvent,
  createWorkflowEvent,
  finalizeWorkflowTurn,
  addWorkflowCheckpoint,
} from '../../products/chat/state/room-routing/workflow.js';
import {
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../../products/chat/state/room-routing/index.js';
import { createRoomRoutingSnapshot } from '../../products/chat/state/room-routing/wake.js';
import { setChannelRoomRouting } from '../../products/chat/state/model/index.js';
import { syncCoreStateWithChatState } from '../../products/chat/state/core-projection/index.js';
import type {
  ChatChannelState,
  ChatState,
} from '../../products/chat/api/contracts.js';
import type {
  RoomRoutingOutcome,
  RoomWorkflowTargetState,
  RoomWorkflowTurn,
} from '../../shared/roomRouting.js';

import type { ResolvedServerDependencies } from './contracts.js';

const INTERRUPTED_WORKFLOW_ERROR =
  'Cats server restarted before room workflow cleanup completed.';

function shouldRecoverWorkflowTurn(turn: RoomWorkflowTurn | null | undefined): boolean {
  if (!turn) {
    return false;
  }

  if (turn.status === 'completed' || turn.status === 'blocked' || turn.status === 'failed') {
    return false;
  }

  return true;
}

function isInterruptedTargetStatus(target: RoomWorkflowTargetState): boolean {
  return target.status === 'pending' || target.status === 'running';
}

function finalizeInterruptedDispatches(
  outcome: RoomRoutingOutcome,
  nowIso: string,
): void {
  for (const dispatch of outcome.dispatches) {
    if (dispatch.status === 'pending' || dispatch.status === 'running') {
      dispatch.status = 'blocked';
      dispatch.completedAt = dispatch.completedAt ?? nowIso;
      dispatch.error = dispatch.error ?? INTERRUPTED_WORKFLOW_ERROR;
    }
  }

  outcome.status = 'blocked';
  outcome.completedAt = nowIso;
}

function createFallbackOutcome(
  channel: ChatChannelState,
  turn: RoomWorkflowTurn,
  nowIso: string,
): RoomRoutingOutcome {
  return {
    turnId: turn.id,
    mode: channel.roomRouting?.mode ?? 'boss_chat',
    sourceMessageId: turn.sourceMessageId,
    sourceSenderKind: turn.sourceSenderKind,
    sourceSenderName: turn.sourceSenderName,
    status: 'blocked',
    resolution: {
      routingMode: 'room_default',
      selectionKind: 'blocked',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: INTERRUPTED_WORKFLOW_ERROR,
    },
    resolvedTargets: turn.targetStatuses.map((target) => structuredClone(target.participant)),
    unresolvedMentions: [],
    dispatches: [],
    checkpoints: [],
    continuationCount: turn.continuationCount,
    totalDispatchCount: turn.dispatchCount,
    guard: null,
    startedAt: turn.startedAt,
    completedAt: nowIso,
  };
}

function recoverChannelWorkflowTurn(
  state: ChatState,
  channel: ChatChannelState,
  now: Date,
): ChatState {
  const nowIso = now.toISOString();
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = workflow.activeTurn;
  if (!activeTurn) {
    return state;
  }

  const outcome = roomRouting.lastOutcome?.turnId === activeTurn.id
    ? structuredClone(roomRouting.lastOutcome)
    : createFallbackOutcome(channel, activeTurn, nowIso);
  finalizeInterruptedDispatches(outcome, nowIso);

  const interruptedTargets = activeTurn.targetStatuses
    .filter(isInterruptedTargetStatus)
    .map((target) => structuredClone(target.participant));

  for (const target of activeTurn.targetStatuses) {
    if (!isInterruptedTargetStatus(target)) {
      continue;
    }

    target.status = 'blocked';
    target.completedAt = target.completedAt ?? nowIso;
    target.error = target.error ?? INTERRUPTED_WORKFLOW_ERROR;
  }

  const priorStageId = activeTurn.stageId;
  const latestCheckpoint = addWorkflowCheckpoint(
    outcome,
    workflow,
    activeTurn,
    'loop_guard',
    'Recovered an interrupted room workflow after restart.',
    nowIso,
    null,
    interruptedTargets,
    {
      reason: 'startup_restart',
      recoveryPhase: 'startup_recovered',
      recoverySource: 'server_restart',
      interruptedError: INTERRUPTED_WORKFLOW_ERROR,
      interruptedTargetCount: interruptedTargets.length,
      workflowStageIdBeforeRecovery: priorStageId,
    },
  );

  activeTurn.status = 'blocked';
  activeTurn.stageId = 'startup_recovery';
  activeTurn.completedAt = nowIso;
  activeTurn.updatedAt = nowIso;

  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'outcome',
      'blocked',
      'Room workflow moved to blocked recovery after startup interrupted the active turn.',
      nowIso,
      null,
      activeTurn.sourceMessageId,
      interruptedTargets,
      {
        metadata: {
          recoveryPhase: 'startup_recovered',
          recoverySource: 'server_restart',
          interruptedError: INTERRUPTED_WORKFLOW_ERROR,
          interruptedTargetCount: interruptedTargets.length,
          workflowStageIdBeforeRecovery: priorStageId,
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
        },
      },
    ),
  );

  finalizeWorkflowTurn(workflow, activeTurn);

  return setChannelRoomRouting(
    state,
    channel.id,
    createRoomRoutingSnapshot(roomRouting, workflow, outcome, latestCheckpoint),
    now,
  );
}

export async function reconcileChatWorkflowRecoveryOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<number> {
  const now = dependencies.shared.now?.() ?? new Date();
  const initialChat = await dependencies.chat.chatStore.read();
  let nextChat = initialChat;
  let recoveredCount = 0;

  for (const channelId of initialChat.channels.map((channel) => channel.id)) {
    const channel = nextChat.channels.find((candidate) => candidate.id === channelId);
    if (!channel || !shouldRecoverWorkflowTurn(channel.roomRouting?.workflow.activeTurn)) {
      continue;
    }

    nextChat = recoverChannelWorkflowTurn(nextChat, channel, now);
    recoveredCount += 1;
  }

  if (recoveredCount === 0) {
    return 0;
  }

  await dependencies.chat.chatStore.write(nextChat);
  if (dependencies.shared.coreStore !== dependencies.chat.chatStore) {
    const nextCore = syncCoreStateWithChatState(
      nextChat,
      await dependencies.shared.coreStore.readCore(),
    );
    await dependencies.shared.coreStore.writeCore(nextCore);
    await dependencies.chat.chatStore.writeCore(nextCore);
  }

  return recoveredCount;
}
