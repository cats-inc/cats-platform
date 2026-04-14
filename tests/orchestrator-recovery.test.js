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
import { buildChatLaneId } from '../build/server/shared/chatCoreIds.js';
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
          workflowStageId: 'concurrent_fan_out',
          workflowShape: 'concurrent',
          continuationSource: 'workflow_recommendation',
          workflowRecommendation: {
            source: 'boss_replan',
            workflowShape: 'concurrent',
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
  assert.equal(sharedTask.metadata.workflowContinuationReplay?.workflowShape, 'concurrent');
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

test('startup recovery skips startup-recovered sequential continuation replays until every concrete target recovers', async () => {
  const now = new Date('2026-03-26T06:47:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered sequential continuation replay',
      topic: 'Wait for the full preserved sequential audience after restart.',
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
          provider: 'codex',
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
  chatChannel.catAssignments[2].leftAt = '2026-03-26T06:46:00.000Z';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Continue this in sequence once both preserved specialists are back.',
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
      title: existingTask?.title ?? 'Recovered sequential continuation replay',
      status: 'blocked',
      conversationId: existingTask?.conversationId ?? `conversation-channel-${channelId}`,
      summary: existingTask?.summary ?? 'Recover the preserved sequential continuation replay.',
      createdAt: existingTask?.createdAt ?? now.toISOString(),
      metadata: writeWorkflowContinuationReplayMetadata(
        existingTask?.metadata,
        buildWorkflowContinuationReplayRequest({
          channelId,
          checkpointId: 'checkpoint-startup-recovered-sequential',
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
          workflowStageId: 'continuation_handoff',
          workflowShape: 'sequential',
          continuationSource: 'workflow_recommendation',
          unresolvedTargets: ['Verifier-Agent'],
          blockedReason: null,
          recordedAt: '2026-03-26T06:46:30.000Z',
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
      message: 'Startup recovery preserved the interrupted sequential continuation replay.',
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
      now: () => new Date('2026-03-26T06:48:00.000Z'),
      async resumeWorkflowContinuationDispatch() {
        resumeCalls += 1;
        throw new Error('startup recovery should not replay partially recovered sequential targets');
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
  assert.equal(sharedTask.metadata.workflowContinuationReplay?.workflowShape, 'sequential');
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
    response: null,
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
        response: null,
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
    response: null,
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
        response: null,
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

test('startup recovery preserves later sequential continuation audiences beyond the running target', async () => {
  const now = new Date('2026-03-26T06:26:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered later sequential continuation',
      topic: 'Keep the full later sequential queue after startup recovery.',
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
        {
          name: 'Verifier-Agent',
          provider: 'codex',
          roles: ['verifier'],
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
      body: 'Please hand this later-stage sequential review to Reviewer-Agent, then Verifier-Agent.',
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
  const verifierParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[2]?.catId ?? 'cat-verifier-agent',
    participantName: channel.assignedCats[2]?.name ?? 'Verifier-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-later-sequential-recovery';
  activeTurn.dispatchCount = 2;
  activeTurn.continuationCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-later-sequential-recovery',
    dispatchId: 'dispatch-interrupted-later-sequential-recovery',
    participant: reviewerParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-later-sequential-continuation',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'checkpoint',
      'running',
      'Inline-Agent handed the room to Reviewer-Agent, then Verifier-Agent.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [reviewerParticipant, verifierParticipant],
      {
        checkpointId: 'checkpoint-later-sequential-continuation',
        metadata: {
          checkpointKind: 'continuation',
          mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          branchStrategy: 'transplant_context',
          continuationSource: 'explicit_mentions',
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
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Reviewer-Agent is running and Verifier-Agent remains queued next.',
    },
    resolvedTargets: [reviewerParticipant, verifierParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-later-sequential-recovery',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: reviewerParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 2,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const recoveredCount = await reconcileChatWorkflowRecoveryOnStartup({
    shared: {
      coreStore: chatStore,
      now: () => new Date('2026-03-26T06:27:00.000Z'),
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
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
  assert.equal(replay?.sourceMessageId, sourceMessage.id);
  assert.deepEqual(replay?.sourceParticipant, inlineParticipant);
  assert.deepEqual(
    replay?.targets.map((target) => target.participantId),
    [
      reviewerParticipant.participantId,
      verifierParticipant.participantId,
    ],
  );
});

test('startup recovery auto-resumes later sequential continuation audiences after core sync', async () => {
  const now = new Date('2026-03-26T06:26:30.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered later sequential auto-resume',
      topic: 'Resume the full later sequential queue after startup recovery.',
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
        {
          name: 'Verifier-Agent',
          provider: 'codex',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const channelState = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channelState);
  channelState.catAssignments[1].execution.lease.sessionId = 'session-reviewer';
  channelState.catAssignments[1].execution.lease.status = 'ready';
  channelState.catAssignments[2].execution.lease.sessionId = 'session-verifier';
  channelState.catAssignments[2].execution.lease.status = 'ready';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Inline-Agent',
      body: 'Please hand this later-stage sequential review to Reviewer-Agent, then Verifier-Agent.',
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
  const verifierParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[2]?.catId ?? 'cat-verifier-agent',
    participantName: channel.assignedCats[2]?.name ?? 'Verifier-Agent',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-later-sequential-auto-resume';
  activeTurn.dispatchCount = 2;
  activeTurn.continuationCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-later-sequential-auto-resume',
    dispatchId: 'dispatch-interrupted-later-sequential-auto-resume',
    participant: reviewerParticipant,
    source: inlineParticipant,
    sourceMessageId: sourceMessage.id,
    trigger: 'continuation_mention',
    mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
    depth: 1,
    parentCheckpointId: 'checkpoint-later-sequential-auto-resume',
    branchStrategy: 'transplant_context',
    handoffReason: 'workflow_continuation',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'checkpoint',
      'running',
      'Inline-Agent handed the room to Reviewer-Agent, then Verifier-Agent.',
      now.toISOString(),
      inlineParticipant,
      sourceMessage.id,
      [reviewerParticipant, verifierParticipant],
      {
        checkpointId: 'checkpoint-later-sequential-auto-resume',
        metadata: {
          checkpointKind: 'continuation',
          mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
          workflowStageId: activeTurn.stageId,
          workflowShape: activeTurn.workflowShape,
          branchStrategy: 'transplant_context',
          continuationSource: 'explicit_mentions',
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
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Reviewer-Agent is running and Verifier-Agent remains queued next.',
    },
    resolvedTargets: [reviewerParticipant, verifierParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-later-sequential-auto-resume',
        sourceMessageId: sourceMessage.id,
        source: inlineParticipant,
        target: reviewerParticipant,
        trigger: 'continuation_mention',
        status: 'running',
        mentionNames: ['Reviewer-Agent', 'Verifier-Agent'],
        response: null,
        startedAt: now.toISOString(),
        completedAt: null,
        error: null,
      },
    ],
    checkpoints: [],
    continuationCount: 1,
    totalDispatchCount: 2,
    guard: null,
    startedAt: now.toISOString(),
    completedAt: null,
  };
  chat = setChannelRoomRouting(chat, channelId, roomRouting, now);

  const chatStore = new MemoryChatStore(chat);
  const sharedCoreStore = new MemoryCoreStore(await chatStore.readCore());

  const chatRecoveredCount = await reconcileChatWorkflowRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:27:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(chatRecoveredCount, 1);

  const resumedRequests = [];
  const orchestratorRecoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:28:00.000Z'),
      async resumeWorkflowContinuationDispatch(request) {
        resumedRequests.push(request);
        return {
          channelId: request.channelId,
          sourceMessageId: request.sourceMessageId,
          status: 'dispatched',
          blockedReason: null,
          results: [
            { participantId: reviewerParticipant.participantId },
            { participantId: verifierParticipant.participantId },
          ],
          executionState: 'completed',
        };
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(orchestratorRecoveredCount, 1);
  assert.equal(resumedRequests.length, 1);
  assert.deepEqual(resumedRequests[0]?.sourceParticipant, inlineParticipant);
  assert.equal(resumedRequests[0]?.sourceMessageId, sourceMessage.id);
  assert.deepEqual(
    resumedRequests[0]?.targets.map((target) => target.participantId),
    [
      reviewerParticipant.participantId,
      verifierParticipant.participantId,
    ],
  );
  const sharedCore = await sharedCoreStore.readCore();
  assert.ok(
    sharedCore.activities.some((activity) =>
      activity.taskId === buildChannelTaskId(channelId)
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'replay_dispatched'
      && activity.metadata?.resultCount === 2),
  );
});

test('startup recovery preserves the full initial sequential audience for interrupted user-origin turns', async () => {
  const now = new Date('2026-03-26T06:27:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered initial sequential turn',
      topic: 'Preserve the whole planned audience after startup recovery.',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
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
      body: 'Run this room in sequence.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: channel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: channel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: channel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-initial-sequential-recovery';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-initial-sequential-recovery',
    dispatchId: 'dispatch-interrupted-initial-sequential-recovery',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
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
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is waiting on Agent-1.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-initial-sequential-recovery',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'running',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: null,
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
      now: () => new Date('2026-03-26T06:28:00.000Z'),
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
  assert.equal(replay?.workflowStageId, 'continuation_handoff');
  assert.equal(replay?.workflowShape, 'sequential');
  assert.equal(replay?.sourceMessageId, sourceMessage.id);
  assert.equal(replay?.sourceParticipant, null);
  assert.deepEqual(
    replay?.targets.map((target) => target.participantId),
    [
      firstParticipant.participantId,
      secondParticipant.participantId,
      thirdParticipant.participantId,
    ],
  );
  assert.ok(
    core.activities.some((activity) =>
      activity.taskId === buildChannelTaskId(channelId)
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'startup_recovered'),
  );
});

test('startup recovery advances initial sequential replays to the latest completed assistant handoff', async () => {
  const now = new Date('2026-03-26T06:28:30.000Z');
  const responseAt = new Date('2026-03-26T06:28:45.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered initial sequential handoff',
      topic: 'Preserve the latest assistant handoff before the next sequential target materializes.',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
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
      body: 'Run this room in sequence and keep handing off.',
    },
    now,
  ).state;

  const sourceChannel = buildChannelView(chat, channelId);
  const sourceMessage = sourceChannel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: sourceChannel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: sourceChannel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: sourceChannel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: sourceChannel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: sourceChannel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: sourceChannel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const appendedReply = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: 'Agent-1 handled the first step.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-initial-sequential-handoff',
        terminal: true,
        turnId: 'turn-interrupted-initial-sequential-handoff',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        sourceMessageId: sourceMessage.id,
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  );
  chat = appendedReply.state;
  const handoffMessageId = appendedReply.message.id;

  const channel = buildChannelView(chat, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-initial-sequential-handoff';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-initial-sequential-handoff',
    dispatchId: 'dispatch-interrupted-initial-sequential-handoff',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: responseAt.toISOString(),
    response: {
      assistantTurnId: 'assistant-turn-initial-sequential-handoff',
      messageIds: [handoffMessageId],
      fullText: 'Agent-1 handled the first step.',
      segmentCount: 1,
    },
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
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
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is waiting for the next handoff target.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-initial-sequential-handoff',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'completed',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: {
          assistantTurnId: 'assistant-turn-initial-sequential-handoff',
          messageIds: [handoffMessageId],
          fullText: 'Agent-1 handled the first step.',
          segmentCount: 1,
        },
        startedAt: now.toISOString(),
        completedAt: responseAt.toISOString(),
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
      now: () => new Date('2026-03-26T06:29:00.000Z'),
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
  assert.equal(replay?.workflowShape, 'sequential');
  assert.equal(replay?.sourceMessageId, handoffMessageId);
  assert.equal(replay?.sourceTurnId, activeTurn.id);
  assert.equal(
    replay?.sourceLaneId,
    buildChatLaneId(
      activeTurn.id,
      'target-state-interrupted-initial-sequential-handoff',
      firstParticipant.participantId,
    ),
  );
  assert.equal(
    replay?.sourceAssistantTurnId,
    'assistant-turn-initial-sequential-handoff',
  );
  assert.equal(replay?.sourceParticipant?.participantName, 'Agent-1');
  assert.equal(replay?.branchStrategy, 'transplant_context');
  assert.deepEqual(
    replay?.targets.map((target) => target.participantName),
    ['Agent-2', 'Agent-3'],
  );
});

test('startup recovery auto-resumes initial sequential replays from the latest completed assistant handoff', async () => {
  const now = new Date('2026-03-26T06:29:30.000Z');
  const responseAt = new Date('2026-03-26T06:29:45.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered initial sequential latest handoff auto-resume',
      topic: 'Resume the remaining audience from the newest assistant handoff after restart.',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const channelState = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channelState);
  channelState.catAssignments[0].execution.lease.sessionId = 'session-agent-1';
  channelState.catAssignments[0].execution.lease.status = 'ready';
  channelState.catAssignments[1].execution.lease.sessionId = 'session-agent-2';
  channelState.catAssignments[1].execution.lease.status = 'ready';
  channelState.catAssignments[2].execution.lease.sessionId = 'session-agent-3';
  channelState.catAssignments[2].execution.lease.status = 'ready';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Resume the remaining audience from the latest handoff.',
    },
    now,
  ).state;

  const initialChannel = buildChannelView(chat, channelId);
  const sourceMessage = initialChannel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: initialChannel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: initialChannel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: initialChannel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: initialChannel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const appendedReply = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'Agent-1',
      body: 'Agent-1 handled the first step.',
    },
    responseAt,
    {
      metadata: {
        event: 'assistant_turn_segment',
        assistantTurnId: 'assistant-turn-initial-sequential-handoff-auto-resume',
        terminal: true,
        turnId: 'turn-interrupted-initial-sequential-handoff-auto-resume',
        targetKind: 'cat',
        targetId: firstParticipant.participantId,
        sourceMessageId: sourceMessage.id,
        routingTrigger: 'explicit_mention',
        dispatchDepth: 0,
        segmentIndex: 0,
      },
      incrementUnread: false,
    },
  );
  chat = appendedReply.state;
  const handoffMessageId = appendedReply.message.id;

  const channel = buildChannelView(chat, channelId);
  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-initial-sequential-handoff-auto-resume';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-initial-sequential-handoff-auto-resume',
    dispatchId: 'dispatch-interrupted-initial-sequential-handoff-auto-resume',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'completed',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: responseAt.toISOString(),
    response: {
      assistantTurnId: 'assistant-turn-initial-sequential-handoff-auto-resume',
      messageIds: [handoffMessageId],
      fullText: 'Agent-1 handled the first step.',
      segmentCount: 1,
    },
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
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
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is waiting for the next handoff target.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-initial-sequential-handoff-auto-resume',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'completed',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: {
          assistantTurnId: 'assistant-turn-initial-sequential-handoff-auto-resume',
          messageIds: [handoffMessageId],
          fullText: 'Agent-1 handled the first step.',
          segmentCount: 1,
        },
        startedAt: now.toISOString(),
        completedAt: responseAt.toISOString(),
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
  const sharedCoreStore = new MemoryCoreStore(await chatStore.readCore());

  const chatRecoveredCount = await reconcileChatWorkflowRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:30:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(chatRecoveredCount, 1);

  const resumedRequests = [];
  const orchestratorRecoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:31:00.000Z'),
      async resumeWorkflowContinuationDispatch(request) {
        resumedRequests.push(request);
        const latestCore = await chatStore.readCore();
        const latestTask = latestCore.tasks.find((candidate) =>
          candidate.id === buildChannelTaskId(channelId));
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
          results: [
            { participantId: secondParticipant.participantId },
            { participantId: thirdParticipant.participantId },
          ],
          executionState: 'completed',
        };
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(orchestratorRecoveredCount, 1);
  assert.equal(resumedRequests.length, 1);
  assert.equal(resumedRequests[0]?.sourceParticipant?.participantName, 'Agent-1');
  assert.equal(resumedRequests[0]?.sourceMessageId, handoffMessageId);
  assert.equal(
    resumedRequests[0]?.sourceTurnId,
    activeTurn.id,
  );
  assert.equal(
    resumedRequests[0]?.sourceLaneId,
    buildChatLaneId(
      activeTurn.id,
      'target-state-interrupted-initial-sequential-handoff-auto-resume',
      firstParticipant.participantId,
    ),
  );
  assert.equal(
    resumedRequests[0]?.sourceAssistantTurnId,
    'assistant-turn-initial-sequential-handoff-auto-resume',
  );
  assert.equal(resumedRequests[0]?.branchStrategy, 'transplant_context');
  assert.deepEqual(
    resumedRequests[0]?.targets.map((target) => target.participantId),
    [
      secondParticipant.participantId,
      thirdParticipant.participantId,
    ],
  );
});

test('startup recovery auto-resumes preserved initial sequential user-origin replays after core sync', async () => {
  const now = new Date('2026-03-26T06:29:00.000Z');
  let chat = createDefaultChatState();
  chat = createChannel(
    chat,
    {
      title: 'Recovered initial sequential auto-resume',
      topic: 'Resume the full user-origin sequential audience after restart.',
      cats: [
        {
          name: 'Agent-1',
          provider: 'claude',
          roles: ['reviewer'],
        },
        {
          name: 'Agent-2',
          provider: 'gemini',
          roles: ['implementer'],
        },
        {
          name: 'Agent-3',
          provider: 'codex',
          roles: ['verifier'],
        },
      ],
    },
    now,
  );

  const channelId = chat.channels[0]?.id;
  assert.ok(channelId);
  const channelState = chat.channels.find((candidate) => candidate.id === channelId);
  assert.ok(channelState);
  channelState.catAssignments[0].execution.lease.sessionId = 'session-agent-1';
  channelState.catAssignments[0].execution.lease.status = 'ready';
  channelState.catAssignments[1].execution.lease.sessionId = 'session-agent-2';
  channelState.catAssignments[1].execution.lease.status = 'ready';
  channelState.catAssignments[2].execution.lease.sessionId = 'session-agent-3';
  channelState.catAssignments[2].execution.lease.status = 'ready';
  chat = appendMessage(
    chat,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Owner',
      body: 'Run this room in sequence after the restart.',
    },
    now,
  ).state;

  const channel = buildChannelView(chat, channelId);
  const sourceMessage = channel.messages.at(-1);
  assert.ok(sourceMessage);
  const firstParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[0]?.catId ?? 'cat-agent-1',
    participantName: channel.assignedCats[0]?.name ?? 'Agent-1',
  };
  const secondParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[1]?.catId ?? 'cat-agent-2',
    participantName: channel.assignedCats[1]?.name ?? 'Agent-2',
  };
  const thirdParticipant = {
    participantKind: 'cat',
    participantId: channel.assignedCats[2]?.catId ?? 'cat-agent-3',
    participantName: channel.assignedCats[2]?.name ?? 'Agent-3',
  };

  const roomRouting = resolveRoomRoutingState(channel.roomRouting);
  const workflow = resolveRoomWorkflowState(roomRouting.workflow);
  const activeTurn = createWorkflowTurn(
    sourceMessage,
    now.toISOString(),
    'continuation_handoff',
    'sequential',
  );
  activeTurn.id = 'turn-interrupted-initial-sequential-auto-resume';
  activeTurn.dispatchCount = 1;
  activeTurn.targetStatuses.push({
    id: 'target-state-interrupted-initial-sequential-auto-resume',
    dispatchId: 'dispatch-interrupted-initial-sequential-auto-resume',
    participant: firstParticipant,
    source: null,
    sourceMessageId: sourceMessage.id,
    trigger: 'explicit_mention',
    mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
    depth: 0,
    parentCheckpointId: null,
    branchStrategy: 'fresh_no_parent',
    handoffReason: 'explicit_mention',
    wakeRequestId: null,
    status: 'running',
    queuedAt: now.toISOString(),
    startedAt: now.toISOString(),
    completedAt: null,
    response: null,
    error: null,
  });
  appendWorkflowEvent(
    workflow,
    activeTurn,
    createWorkflowEvent(
      activeTurn.id,
      'turn_started',
      'running',
      'System resumed the initial sequential audience.',
      now.toISOString(),
      null,
      sourceMessage.id,
      [firstParticipant, secondParticipant, thirdParticipant],
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
    sourceMessageId: sourceMessage.id,
    sourceSenderKind: sourceMessage.senderKind,
    sourceSenderName: sourceMessage.senderName,
    status: 'running',
    resolution: {
      routingMode: 'explicit_multi',
      selectionKind: 'explicit_mentions',
      defaultTarget: null,
      defaultTargetReason: null,
      fallbackTarget: null,
      blockedReason: null,
      note: 'Initial sequential audience is waiting on Agent-1.',
    },
    resolvedTargets: [firstParticipant, secondParticipant, thirdParticipant],
    unresolvedMentions: [],
    dispatches: [
      {
        id: 'dispatch-interrupted-initial-sequential-auto-resume',
        sourceMessageId: sourceMessage.id,
        source: null,
        target: firstParticipant,
        trigger: 'explicit_mention',
        status: 'running',
        mentionNames: ['Agent-1', 'Agent-2', 'Agent-3'],
        response: null,
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
  const sharedCoreStore = new MemoryCoreStore(await chatStore.readCore());

  const chatRecoveredCount = await reconcileChatWorkflowRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:30:00.000Z'),
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(chatRecoveredCount, 1);

  const resumedRequests = [];
  const orchestratorRecoveredCount = await reconcileOrchestratorRecoveryOnStartup({
    shared: {
      coreStore: sharedCoreStore,
      now: () => new Date('2026-03-26T06:31:00.000Z'),
      async resumeWorkflowContinuationDispatch(request) {
        resumedRequests.push(request);
        const latestCore = await chatStore.readCore();
        const latestTask = latestCore.tasks.find((candidate) =>
          candidate.id === buildChannelTaskId(channelId));
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
          results: [
            { participantId: firstParticipant.participantId },
            { participantId: secondParticipant.participantId },
            { participantId: thirdParticipant.participantId },
          ],
          executionState: 'completed',
        };
      },
    },
    chat: {
      chatStore,
    },
  });

  assert.equal(orchestratorRecoveredCount, 1);
  assert.equal(resumedRequests.length, 1);
  assert.equal(resumedRequests[0]?.sourceParticipant, null);
  assert.equal(resumedRequests[0]?.sourceMessageId, sourceMessage.id);
  assert.deepEqual(
    resumedRequests[0]?.targets.map((target) => target.participantId),
    [
      firstParticipant.participantId,
      secondParticipant.participantId,
      thirdParticipant.participantId,
    ],
  );

  const sharedCore = await sharedCoreStore.readCore();
  const sharedTask = sharedCore.tasks.find((candidate) =>
    candidate.id === buildChannelTaskId(channelId));
  assert.ok(sharedTask);
  assert.ok(
    sharedCore.activities.some((activity) =>
      activity.taskId === buildChannelTaskId(channelId)
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'startup_recovered'),
  );
  assert.ok(
    sharedCore.activities.some((activity) =>
      activity.taskId === buildChannelTaskId(channelId)
      && activity.metadata?.source === 'workflow-continuation-replay'
      && activity.metadata?.replayPhase === 'replay_dispatched'
      && activity.metadata?.resultCount === 3),
  );
});
