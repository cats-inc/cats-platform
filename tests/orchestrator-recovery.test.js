import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreTask } from '../dist-server/core/model/index.js';
import { MemoryCoreStore } from '../dist-server/core/store.js';
import { createDefaultChatState } from '../dist-server/chat/defaults.js';
import {
  appendMessage,
  buildChannelView,
  createChannel,
  setChannelRoomRouting,
} from '../dist-server/chat/model.js';
import { MemoryChatStore } from '../dist-server/chat/store.js';
import { buildRoomWorkflowRunId } from '../dist-server/platform/orchestration/runIds.js';
import { reconcileChatWorkflowRecoveryOnStartup } from '../dist-server/app/server/chatWorkflowRecovery.js';
import { reconcileOrchestratorRecoveryOnStartup } from '../dist-server/app/server/orchestratorRecovery.js';
import {
  buildPendingOrchestratorDispatchRequest,
  readPendingOrchestratorDispatchSnapshot,
  writePendingOrchestratorDispatchMetadata,
} from '../dist-server/platform/orchestration/pendingDispatch.js';
import {
  buildOrchestratorDispatchReplayRequest,
  readOrchestratorDispatchReplay,
  writeOrchestratorDispatchReplayMetadata,
} from '../dist-server/platform/orchestration/dispatchReplay.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../dist-server/platform/orchestration/workflowContinuationReplay.js';
import {
  createDefaultRoomRoutingState,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../dist-server/products/chat/state/room-routing/index.js';
import {
  appendWorkflowEvent,
  createWorkflowEvent,
  createWorkflowTurn,
} from '../dist-server/products/chat/state/room-routing/workflow.js';

test('startup recovery turns stranded orchestrator replay metadata into retryable failed state', async () => {
  const now = new Date('2026-03-26T06:00:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-recovery-startup',
      title: 'Recover startup replay metadata',
      status: 'blocked',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: writeOrchestratorDispatchReplayMetadata(
        writePendingOrchestratorDispatchMetadata(
          {},
          buildPendingOrchestratorDispatchRequest({
            channelId: 'channel-recovery',
            body: 'Please continue the blocked workflow.',
            blockedAt: '2026-03-26T05:55:00.000Z',
          }),
          {
            replayState: 'in_progress',
            replayTrigger: 'approve',
            replayAttemptAt: '2026-03-26T05:56:00.000Z',
          },
        ),
        buildOrchestratorDispatchReplayRequest({
          channelId: 'channel-recovery',
          body: 'Please continue the blocked workflow.',
          recordedAt: '2026-03-26T05:55:00.000Z',
        }),
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T05:57:00.000Z',
        },
      ),
    },
    now,
  );
  const coreStore = new MemoryCoreStore(taskWrite.core);

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore,
      now: () => new Date('2026-03-26T06:01:00.000Z'),
    },
  });

  assert.equal(recoveredCount, 1);

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === 'task-recovery-startup');
  const pendingDispatch = readPendingOrchestratorDispatchSnapshot(task?.metadata, {
    includeInProgress: true,
  });
  const replay = readOrchestratorDispatchReplay(task?.metadata, {
    includeInProgress: true,
  });
  const recoveryNote = core.activities.find((candidate) =>
    candidate.taskId === 'task-recovery-startup'
    && candidate.metadata?.source === 'orchestrator-startup-recovery');

  assert.equal(pendingDispatch?.replayState, 'failed');
  assert.equal(
    pendingDispatch?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.equal(replay?.replayState, 'failed');
  assert.equal(
    replay?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.ok(recoveryNote);
  assert.equal(recoveryNote?.kind, 'note');
  assert.equal(recoveryNote?.metadata?.replayPhase, 'startup_recovered');
  assert.equal(
    recoveryNote?.metadata?.error,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
});

test('startup recovery turns stranded workflow-continuation replay metadata into retryable failed state', async () => {
  const now = new Date('2026-03-26T06:10:00.000Z');
  const taskWrite = upsertCoreTask(
    createDefaultCoreState(),
    {
      id: 'task-recovery-workflow-continuation',
      title: 'Recover workflow continuation replay metadata',
      status: 'blocked',
      ownerActorId: 'actor-owner',
      assignedActorIds: ['actor-worker'],
      metadata: writeWorkflowContinuationReplayMetadata(
        {},
        buildWorkflowContinuationReplayRequest({
          channelId: 'channel-recovery',
          checkpointId: 'checkpoint-recovery',
          sourceMessageId: 'message-followup',
          sourceParticipant: {
            participantKind: 'cat',
            participantId: 'cat-inline',
            participantName: 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: 'cat-followup',
              participantName: 'Followup-Agent',
            },
          ],
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          recordedAt: '2026-03-26T06:09:00.000Z',
        }),
        {
          replayState: 'in_progress',
          replayTrigger: 'retry',
          replayAttemptAt: '2026-03-26T06:09:30.000Z',
        },
      ),
    },
    now,
  );
  const coreStore = new MemoryCoreStore(taskWrite.core);

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore,
      now: () => new Date('2026-03-26T06:11:00.000Z'),
    },
  });

  assert.equal(recoveredCount, 1);

  const core = await coreStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === 'task-recovery-workflow-continuation');
  const replay = readWorkflowContinuationReplay(task?.metadata, {
    includeInProgress: true,
  });
  const recoveryNote = core.activities.find((candidate) =>
    candidate.taskId === 'task-recovery-workflow-continuation'
    && candidate.metadata?.source === 'workflow-continuation-replay');

  assert.equal(replay?.replayState, 'failed');
  assert.equal(
    replay?.replayError,
    'Cats server restarted before orchestrator replay cleanup completed.',
  );
  assert.ok(recoveryNote);
  assert.equal(recoveryNote?.kind, 'note');
  assert.equal(recoveryNote?.metadata?.replayPhase, 'startup_recovered');
});

test('startup recovery finalizes stranded room workflow turns into blocked history and core records', async () => {
  const now = new Date('2026-03-26T06:20:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Workflow Recovery',
      topic: 'Recover interrupted room workflow turns after restart.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Please review this interrupted workflow turn.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const userMessage = channel.messages[channel.messages.length - 1];
  assert.ok(userMessage);
  const participant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[0]?.catId ?? 'cat-inline-agent',
    participantName: channel.assignedCats[0]?.name ?? 'Inline-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    userMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-workflow';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-workflow',
    dispatchId: 'dispatch-interrupted-workflow',
    participant,
    source: null,
    sourceMessageId: userMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Inline-Agent'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'transplant_context',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    responseMessageId: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System routing started a new room turn.',
      now.toISOString(),
      null,
      userMessage.id,
      [participant],
      {
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: userMessage.id,
    sourceSenderKind: userMessage.senderKind,
    sourceSenderName: userMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Started explicit dispatch.',
    },
    resolvedTargets: [participant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-workflow',
        sourceMessageId: userMessage.id,
        source: null,
        target: participant,
        trigger: 'explicit_mention',
        status: 'running',
        mentionNames: ['Inline-Agent'],
        responseMessageId: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 0,
    totalDispatchCount: 1,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const recoveredCount = await reconcileChatWorkflowRecoveryOnStartup({
    shared: {
      coreStore: chatStore,
      now: () => new Date('2026-03-26T06:21:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(recoveredCount, 1);

  const recoveredChat = await chatStore.read();
  const recoveredChannel = recoveredChat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(recoveredChannel);
  assert.equal(recoveredChannel?.roomRouting?.workflow.activeTurn, null);
  assert.equal(recoveredChannel?.roomRouting?.workflow.turnHistory[0]?.status, 'blocked');
  assert.equal(recoveredChannel?.roomRouting?.workflow.turnHistory[0]?.stageId, 'startup_recovery');
  assert.equal(
    recoveredChannel?.roomRouting?.workflow.turnHistory[0]?.targetStatuses[0]?.status,
    'blocked',
  );
  assert.equal(
    recoveredChannel?.roomRouting?.workflow.turnHistory[0]?.targetStatuses[0]?.error,
    'Cats server restarted before room workflow cleanup completed.',
  );
  assert.equal(recoveredChannel?.roomRouting?.lastOutcome?.status, 'blocked');
  assert.equal(
    recoveredChannel?.roomRouting?.lastOutcome?.dispatches[0]?.status,
    'blocked',
  );
  assert.ok(
    recoveredChannel?.roomRouting?.workflow.eventHistory.some((event) =>
      event.metadata?.recoverySource === 'server_restart'
      && event.metadata?.recoveryPhase === 'startup_recovered'),
  );

  const core = await chatStore.readCore();
  const runId = buildRoomWorkflowRunId(channelId, activeTurn.id);
  const run = core.runs.find((candidate) => candidate.id === runId);
  const outcome = core.outcomes.find((candidate) => candidate.runId === runId);
  const activity = core.activities.find((candidate) =>
    candidate.runId === runId
    && candidate.metadata?.recoverySource === 'server_restart'
    && candidate.metadata?.eventKind === 'outcome');

  assert.equal(run?.status, 'blocked');
  assert.equal(run?.metadata?.workflowStageId, 'startup_recovery');
  assert.equal(outcome?.status, 'blocked');
  assert.ok(activity);
  assert.match(activity?.message ?? '', /startup interrupted the active turn/i);
});
