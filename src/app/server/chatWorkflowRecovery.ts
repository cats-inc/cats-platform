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
import { repairOrphanedCompletedDispatchTurn } from '../../products/chat/state/runtime-dispatch/repair.js';
import { syncCoreStateWithChatState } from '../../products/chat/state/core-projection/index.js';
import {
  appendOrchestratorReplayActivity,
} from '../../platform/orchestration/replayActivity.js';
import {
  readWorkflowContinuationReplay,
} from '../../platform/orchestration/workflowContinuationReplay.js';
import type { CatsCoreState } from '../../core/types.js';
import type {
  ChatChannelState,
  ChatState,
} from '../../products/chat/api/contracts.js';
import type {
  RoomRoutingOutcome,
  RoomRoutingParticipantRef,
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

function sameParticipantRef(
  left: RoomRoutingParticipantRef,
  right: RoomRoutingParticipantRef,
): boolean {
  return left.participantKind === right.participantKind
    && left.participantId === right.participantId
    && left.participantName === right.participantName;
}

function resolveInterruptedTargetsForRecovery(
  turn: RoomWorkflowTurn,
): RoomRoutingParticipantRef[] {
  const interruptedTargets = turn.targetStatuses
    .filter(isInterruptedTargetStatus)
    .map((target) => structuredClone(target.participant));
  if (interruptedTargets.length > 0) {
    return interruptedTargets;
  }
  if (
    turn.workflowShape !== 'sequential'
    || turn.sourceSenderKind !== 'user'
    || turn.targetStatuses.length === 0
    || !turn.targetStatuses.every((target) => target.depth === 0 && target.source === null)
  ) {
    return [];
  }

  const turnStartedTargets = turn.events.find((event) => event.kind === 'turn_started')?.targets ?? [];
  if (turnStartedTargets.length === 0) {
    return [];
  }

  let lastMaterializedIndex = -1;
  for (const targetStatus of turn.targetStatuses) {
    const targetIndex = turnStartedTargets.findIndex((participant) =>
      sameParticipantRef(participant, targetStatus.participant));
    if (targetIndex > lastMaterializedIndex) {
      lastMaterializedIndex = targetIndex;
    }
  }

  if (lastMaterializedIndex < 0 || lastMaterializedIndex >= turnStartedTargets.length - 1) {
    return [];
  }

  return turnStartedTargets
    .slice(lastMaterializedIndex + 1)
    .map((participant) => structuredClone(participant));
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
  core?: CatsCoreState,
): ChatState {
  const repaired = repairOrphanedCompletedDispatchTurn(state, channel.id, now, core);
  if (repaired.repaired) {
    return repaired.state;
  }

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

  const interruptedTargets = resolveInterruptedTargetsForRecovery(activeTurn);

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

async function writeSynchronizedCoreState(
  dependencies: ResolvedServerDependencies,
  core: CatsCoreState,
): Promise<void> {
  await dependencies.shared.coreStore.writeCore(core);
  if (dependencies.shared.coreStore !== dependencies.chat.chatStore) {
    await dependencies.chat.chatStore.writeCore(core);
  }
}

export async function reconcileChatWorkflowRecoveryOnStartup(
  dependencies: ResolvedServerDependencies,
): Promise<number> {
  const now = dependencies.shared.now?.() ?? new Date();
  const initialChat = await dependencies.chat.chatStore.read();
  const initialCore = await dependencies.shared.coreStore.readCore();
  let nextChat = initialChat;
  let recoveredCount = 0;
  const recoveredTaskIds: string[] = [];

  for (const channelId of initialChat.channels.map((channel) => channel.id)) {
    const channel = nextChat.channels.find((candidate) => candidate.id === channelId);
    if (!channel || !shouldRecoverWorkflowTurn(channel.roomRouting?.workflow.activeTurn)) {
      continue;
    }

    nextChat = recoverChannelWorkflowTurn(nextChat, channel, now, initialCore);
    recoveredTaskIds.push(`task-channel-${channelId}`);
    recoveredCount += 1;
  }

  if (recoveredCount === 0) {
    return 0;
  }

  await dependencies.chat.chatStore.write(nextChat);
  let nextCore = dependencies.shared.coreStore !== dependencies.chat.chatStore
    ? syncCoreStateWithChatState(
      nextChat,
      await dependencies.shared.coreStore.readCore(),
    )
    : await dependencies.chat.chatStore.readCore();

  for (const taskId of recoveredTaskIds) {
    const task = nextCore.tasks.find((candidate) => candidate.id === taskId);
    const replay = readWorkflowContinuationReplay(task?.metadata);
    if (!task || !replay || replay.blockedReason !== null) {
      continue;
    }

    nextCore = appendOrchestratorReplayActivity(
      nextCore,
      {
        task,
        source: 'workflow-continuation-replay',
        phase: 'startup_recovered',
      },
      now,
    ).core;
  }

  if (dependencies.shared.coreStore !== dependencies.chat.chatStore || recoveredTaskIds.length > 0) {
    await writeSynchronizedCoreState(dependencies, nextCore);
  }

  return recoveredCount;
}
