import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendCoreActivity,
  createDefaultCoreState,
  upsertCoreTask,
} from '../build/server/core/model/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  appendMessage,
  buildChannelView,
  createChannel,
  setChannelRoomRouting,
} from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { buildRoomWorkflowRunId } from '../build/server/platform/orchestration/runIds.js';
import { reconcileChatWorkflowRecoveryOnStartup } from '../build/server/app/server/chatWorkflowRecovery.js';
import { reconcileOrchestratorRecoveryOnStartup } from '../build/server/app/server/orchestratorRecovery.js';
import {
  buildPendingOrchestratorDispatchRequest,
  readPendingOrchestratorDispatchSnapshot,
  writePendingOrchestratorDispatchMetadata,
} from '../build/server/platform/orchestration/pendingDispatch.js';
import {
  buildOrchestratorDispatchReplayRequest,
  readOrchestratorDispatchReplay,
  writeOrchestratorDispatchReplayMetadata,
} from '../build/server/platform/orchestration/dispatchReplay.js';
import {
  buildWorkflowContinuationReplayRequest,
  readWorkflowContinuationReplay,
  writeWorkflowContinuationReplayMetadata,
} from '../build/server/platform/orchestration/workflowContinuationReplay.js';
import {
  createDefaultRoomRoutingState,
  resolveRoomRoutingState,
  resolveRoomWorkflowState,
} from '../build/server/products/chat/state/room-routing/index.js';
import {
  appendWorkflowEvent,
  createWorkflowEvent,
  createWorkflowTurn,
} from '../build/server/products/chat/state/room-routing/workflow.js';

function buildChannelTaskId(channelId) {
  return `task-channel-${channelId}`;
}

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

test('startup recovery auto-resumes recovered continuation replays and syncs shared core state', async () => {
  const now = new Date('2026-03-26T06:30:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered continuation replay',
      topic: 'Resume the stored recommendation after restart.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Followup-Agent',
          provider: 'gemini',
          roles: ['auditor'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const chatChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(chatChannel);
  assert.equal(chatChannel.catAssignments.length, 2);
  chatChannel.catAssignments[0].execution.lease.sessionId = 'session-inline';
  chatChannel.catAssignments[1].execution.lease.sessionId = 'session-followup';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Please continue once the reviewer is available again.',
    },
    now,
  ).state;
  const channel = buildChannelView(chat, channelId);
  const followupTarget = channel.assignedCats[1];
  assert.ok(followupTarget);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);

  const chatStore = new MemoryChatStore();
  await chatStore.write(chat);
  const taskId = buildChannelTaskId(channelId);
  const baseCore = await chatStore.readCore();
  const existingTask = baseCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const taskWrite = upsertCoreTask(
    baseCore,
    {
      id: taskId,
      title: existingTask?.title ?? 'Recovered continuation replay',
      status: 'blocked',
      conversationId: existingTask?.conversationId ?? `conversation-channel-${channelId}`,
      summary: existingTask?.summary ?? 'Resume the recovered continuation replay.',
      createdAt: existingTask?.createdAt ?? now.toISOString(),
      metadata: writeWorkflowContinuationReplayMetadata(
        existingTask?.metadata,
        buildWorkflowContinuationReplayRequest({
          channelId,
          checkpointId: 'checkpoint-startup-auto-resume',
          sourceMessageId: sourceMessage.id,
          sourceParticipant: {
            participantKind: 'cat',
            participantId: channel.assignedCats[0]?.catId ?? 'cat-inline',
            participantName: channel.assignedCats[0]?.name ?? 'Inline-Agent',
          },
          targets: [],
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          continuationSource: 'workflow_recommendation',
          workflowRecommendation: {
            source: 'checkpoint',
            workflowShape: 'sequential',
            reviewRequired: false,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: followupTarget.catId,
                participantName: followupTarget.name,
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Resume the recovered specialist continuation.',
          },
          unresolvedTargets: ['Followup-Agent'],
          blockedReason: 'no_valid_targets',
          recordedAt: '2026-03-26T06:29:00.000Z',
        }),
        {
          replayState: 'ready',
          replayTrigger: 'retry',
        },
      ),
    },
    now,
  );
  await chatStore.writeCore(taskWrite.core);
  const sharedCoreStore = new MemoryCoreStore(taskWrite.core);
  const resumedRequests = [];

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:31:00.000Z'),
      async resumeWorkflowContinuationDispatch(request) {
        resumedRequests.push(request);
        const latestCore = await chatStore.readCore();
        const latestTask = latestCore.tasks.find((candidate) => candidate.id === taskId);
        assert.ok(latestTask);
        const cleared = upsertCoreTask(
          latestCore,
          {
            id: latestTask.id,
            title: latestTask.title,
            status: latestTask.status,
            conversationId: latestTask.conversationId,
            parentTaskId: latestTask.parentTaskId ?? null,
            ownerActorId: latestTask.ownerActorId,
            orchestratorActorId: latestTask.orchestratorActorId,
            assignedActorIds: latestTask.assignedActorIds,
            summary: latestTask.summary,
            approval: latestTask.approval,
            createdAt: latestTask.createdAt,
            metadata: writeWorkflowContinuationReplayMetadata(latestTask.metadata, null),
          },
          new Date('2026-03-26T06:31:00.000Z'),
        );
        await chatStore.writeCore(cleared.core);
        return {
          channelId: request.channelId,
          sourceMessageId: request.sourceMessageId,
          status: 'dispatched',
          blockedReason: null,
          results: [{ participantId: followupTarget.catId }],
          executionState: 'completed',
        };
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(recoveredCount, 1);
  assert.equal(resumedRequests.length, 1);
  const sharedCore = await sharedCoreStore.readCore();
  const sharedTask = sharedCore.tasks.find((candidate) => candidate.id === taskId);
  assert.ok(sharedTask);
  assert.equal(sharedTask.metadata.workflowContinuationReplay, undefined);
  assert.ok(
    sharedCore.activities.some((activity) =>
      activity.taskId === taskId
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'replay_started'
      && activity.metadata?.resumeReason === 'target_recovered'),
  );
  assert.ok(
    sharedCore.activities.some((activity) =>
      activity.taskId === taskId
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'replay_dispatched'
      && activity.metadata?.resumeReason === 'target_recovered'
      && activity.metadata?.resultCount === 1),
  );
  const chatCore = await chatStore.readCore();
  assert.deepEqual(
    chatCore.tasks.find((candidate) => candidate.id === taskId)?.metadata.workflowContinuationReplay,
    undefined,
  );
});

test('startup recovery skips ready continuation replays until targets actually recover', async () => {
  const now = new Date('2026-03-26T06:40:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Still blocked continuation replay',
      topic: 'Do not replay until a target comes back.',
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
  const chatChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(chatChannel);
  chatChannel.catAssignments[0].execution.lease.sessionId = 'session-inline';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Resume this only when the follow-up specialist is available.',
    },
    now,
  ).state;
  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);

  const chatStore = new MemoryChatStore();
  await chatStore.write(chat);
  const taskId = buildChannelTaskId(channelId);
  const baseCore = await chatStore.readCore();
  const taskWrite = upsertCoreTask(
    baseCore,
    {
      id: taskId,
      title: 'Still blocked continuation replay',
      status: 'blocked',
      conversationId: `conversation-channel-${channelId}`,
      summary: 'Keep the replay ready until the target returns.',
      createdAt: now.toISOString(),
      metadata: writeWorkflowContinuationReplayMetadata(
        {},
        buildWorkflowContinuationReplayRequest({
          channelId,
          checkpointId: 'checkpoint-startup-still-blocked',
          sourceMessageId: sourceMessage.id,
          sourceParticipant: {
            participantKind: 'cat',
            participantId: channel.assignedCats[0].catId,
            participantName: channel.assignedCats[0].name,
          },
          targets: [],
          branchStrategy: 'transplant_context',
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          continuationSource: 'workflow_recommendation',
          workflowRecommendation: {
            source: 'checkpoint',
            workflowShape: 'sequential',
            reviewRequired: false,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantName: 'Followup-Agent',
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Wait for the missing follow-up specialist.',
          },
          unresolvedTargets: ['Followup-Agent'],
          blockedReason: 'no_valid_targets',
          recordedAt: '2026-03-26T06:39:00.000Z',
        }),
        {
          replayState: 'ready',
          replayTrigger: 'retry',
        },
      ),
    },
    now,
  );
  await chatStore.writeCore(taskWrite.core);
  const sharedCoreStore = new MemoryCoreStore(taskWrite.core);
  let resumeCalls = 0;

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:41:00.000Z'),
      async resumeWorkflowContinuationDispatch() {
        resumeCalls += 1;
        throw new Error('startup recovery should not replay unresolved targets');
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(recoveredCount, 0);
  assert.equal(resumeCalls, 0);
  const sharedCore = await sharedCoreStore.readCore();
  const sharedTask = sharedCore.tasks.find((candidate) => candidate.id === taskId);
  assert.ok(sharedTask);
  assert.equal(sharedTask.metadata.workflowContinuationReplay?.blockedReason, 'no_valid_targets');
  assert.equal(sharedTask.metadata.workflowContinuationReplay?.replayState, 'ready');
  assert.ok(
    !sharedCore.activities.some((activity) =>
      activity.taskId === taskId
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.resumeReason === 'target_recovered'),
  );
});

test('startup recovery skips startup-recovered parallel continuation replays until every concrete target recovers', async () => {
  const now = new Date('2026-03-26T06:45:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered parallel continuation replay',
      topic: 'Wait for every preserved target to come back after restart.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Followup-Agent',
          provider: 'gemini',
          roles: ['auditor'],
        },
        {
          name: 'Verifier-Agent',
          provider: 'gemini',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const chatChannel = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(chatChannel);
  assert.equal(chatChannel.catAssignments.length, 3);
  chatChannel.catAssignments[1].execution.lease.sessionId = 'session-followup';
  chatChannel.catAssignments[2].status = 'removed';
  chatChannel.catAssignments[2].leftAt = '2026-03-26T06:44:00.000Z';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please fan this out again once both specialists are back.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);

  const chatStore = new MemoryChatStore(chat);
  await chatStore.write(chat);
  const taskId = buildChannelTaskId(channelId);
  const baseCore = await chatStore.readCore();
  const existingTask = baseCore.tasks.find((candidate) => candidate.id === taskId) ?? null;
  const taskWrite = upsertCoreTask(
    baseCore,
    {
      id: taskId,
      title: existingTask?.title ?? 'Recovered parallel continuation replay',
      status: 'blocked',
      conversationId: existingTask?.conversationId ?? `conversation-channel-${channelId}`,
      summary: existingTask?.summary ?? 'Recover the preserved parallel continuation replay.',
      createdAt: existingTask?.createdAt ?? now.toISOString(),
      metadata: writeWorkflowContinuationReplayMetadata(
        existingTask?.metadata,
        buildWorkflowContinuationReplayRequest({
          channelId,
          checkpointId: 'checkpoint-startup-recovered-parallel',
          sourceMessageId: sourceMessage.id,
          sourceParticipant: {
            participantKind: 'cat',
            participantId: channel.assignedCats[0]?.catId ?? 'cat-inline',
            participantName: channel.assignedCats[0]?.name ?? 'Inline-Agent',
          },
          targets: [
            {
              participantKind: 'cat',
              participantId: channel.assignedCats[1]?.catId ?? 'cat-followup',
              participantName: channel.assignedCats[1]?.name ?? 'Followup-Agent',
            },
            {
              participantKind: 'cat',
              participantId: channel.assignedCats[2]?.catId ?? 'cat-verifier',
              participantName: channel.assignedCats[2]?.name ?? 'Verifier-Agent',
            },
          ],
          branchStrategy: 'transplant_context',
          workflowStageId: 'parallel_fan_out',
          workflowShape: 'parallel',
          continuationSource: 'workflow_recommendation',
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'parallel',
            reviewRequired: false,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: channel.assignedCats[1]?.catId ?? 'cat-followup',
                participantName: channel.assignedCats[1]?.name ?? 'Followup-Agent',
              },
              {
                participantKind: 'cat',
                participantId: channel.assignedCats[2]?.catId ?? 'cat-verifier',
                participantName: channel.assignedCats[2]?.name ?? 'Verifier-Agent',
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Wait until every preserved specialist target is back online.',
          },
          unresolvedTargets: ['Verifier-Agent'],
          blockedReason: null,
          recordedAt: '2026-03-26T06:44:30.000Z',
        }),
        {
          replayState: 'ready',
          replayTrigger: 'retry',
        },
      ),
    },
    now,
  );
  const activityWrite = appendCoreActivity(
    taskWrite.core,
    {
      kind: 'note',
      conversationId: existingTask?.conversationId ?? `conversation-channel-${channelId}`,
      taskId,
      message: 'Startup recovery preserved the interrupted parallel continuation replay.',
      metadata: {
        source: 'workflow-continuation-replay',
        replayPhase: 'startup_recovered',
      },
    },
    now,
  );
  const sharedCoreStore = new MemoryCoreStore(activityWrite.core);
  let resumeCalls = 0;

  const recoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:46:00.000Z'),
      async resumeWorkflowContinuationDispatch() {
        resumeCalls += 1;
        throw new Error('startup recovery should not replay partially recovered parallel targets');
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(recoveredCount, 0);
  assert.equal(resumeCalls, 0);
  const sharedCore = await sharedCoreStore.readCore();
  const sharedTask = sharedCore.tasks.find((candidate) => candidate.id === taskId);
  assert.ok(sharedTask);
  assert.equal(sharedTask.metadata.workflowContinuationReplay?.workflowShape, 'parallel');
  assert.deepEqual(
    sharedTask.metadata.workflowContinuationReplay?.targets.map((target) => target.participantName),
    ['Followup-Agent', 'Verifier-Agent'],
  );
  assert.ok(
    !sharedCore.activities.some((activity) =>
      activity.taskId === taskId
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.resumeReason === 'target_recovered'),
  );
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

test('startup recovery preserves retryable continuation replay metadata for interrupted continuation turns', async () => {
  const now = new Date('2026-03-26T06:25:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered continuation turn',
      topic: 'Preserve retryable continuation replay after startup recovery.',
      cats: [
        {
          name: 'Inline-Agent',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Reviewer-Agent',
          provider: 'gemini',
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
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please hand this converge review to Reviewer-Agent.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const inlineParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[0]?.catId ?? 'cat-inline-agent',
    participantName: channel.assignedCats[0]?.name ?? 'Inline-Agent',
  };
  const reviewerParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[1]?.catId ?? 'cat-reviewer-agent',
    participantName: channel.assignedCats[1]?.name ?? 'Reviewer-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'converge_review',
    'converge',
  );
  activeTurn.id = 'turn-interrupted-continuation-recovery';
  activeTurn.reviewRequired = true;
  activeTurn.convergeTargetId = reviewerParticipant.participantId;
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-continuation-recovery',
    dispatchId: 'dispatch-interrupted-continuation-recovery',
    participant: reviewerParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Reviewer-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-converge-review',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
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
      'target_pending',
      'running',
      'Reviewer-Agent is pending converge review.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [reviewerParticipant],
      {
        dispatchId: 'dispatch-interrupted-continuation-recovery',
        metadata: {
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          reviewRequired: true,
          continuationSource: 'workflow_recommendation',
          branchStrategy: 'transplant_context',
          mentionNames: ['Reviewer-Agent'],
          unresolvedTargets: [],
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'converge',
            reviewRequired: true,
            candidateTargets: [
              {
                participantKind: 'cat',
                participantId: reviewerParticipant.participantId,
                participantName: reviewerParticipant.participantName,
              },
            ],
            branchStrategy: 'transplant_context',
            rationale: 'Converge this branch through the designated reviewer.',
          },
        },
      },
    ),
  );
  workflow.activeTurn = activeTurn;
  roomRouting.workflow = workflow;
  roomRouting.lastOutcome = {
    turnId: activeTurn.id,
    mode: roomRouting.mode ?? createDefaultRoomRoutingState().mode,
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_single',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Converge review is waiting on Reviewer-Agent.',
    },
    resolvedTargets: [reviewerParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-continuation-recovery',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: reviewerParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Reviewer-Agent'],
        responseMessageId: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
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
      now: () => new Date('2026-03-26T06:26:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(recoveredCount, 1);

  const core = await chatStore.readCore();
  const task = core.tasks.find((candidate) => candidate.id === buildChannelTaskId(channelId));
  const replay = readWorkflowContinuationReplay(task?.metadata);

  assert.ok(task);
  assert.ok(replay);
  assert.equal(replay?.replayState, 'ready');
  assert.equal(replay?.blockedReason, null);
  assert.equal(replay?.workflowStageId, 'converge_review');
  assert.equal(replay?.workflowShape, 'converge');
  assert.equal(replay?.reviewRequired, true);
  assert.equal(replay?.continuationSource, 'workflow_recommendation');
  assert.equal(replay?.sourceMessageId, sourceMessage.id);
  assert.equal(replay?.sourceParticipant.participantId, inlineParticipant.participantId);
  assert.deepEqual(
    replay?.targets.map((target) => target.participantId),
    [reviewerParticipant.participantId],
  );
  assert.equal(replay?.workflowRecommendation?.workflowShape, 'converge');
  assert.equal(replay?.workflowRecommendation?.source, 'boss_replan');
  assert.ok(
    core.activities.some((activity) =>
      activity.taskId === buildChannelTaskId(channelId)
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'startup_recovered'),
  );
});

