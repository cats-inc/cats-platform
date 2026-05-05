import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  buildChannelView,
  createChannel,
  setChannelParticipantLease,
} from '../src/products/chat/state/model/index.ts';
import {
  resolveMentionRoute,
  resolveRoomDefaultRoutingTarget,
} from '../src/products/chat/state/mentionRouter.ts';
import {
  canResumeWorkflowContinuationReplay,
} from '../src/products/chat/state/runtime-dispatch/replay.ts';
import {
  buildPromptForTarget,
  resolveChoiceResponseTarget,
  resolveExecutionMetadataForTarget,
} from '../src/products/chat/state/runtimeTargeting.ts';
import { shouldRewriteOrchestratorReply } from '../src/products/chat/state/runtime-session/shared.ts';
import type { WorkflowContinuationReplaySnapshot } from '../src/platform/orchestration/workflowContinuationReplay.ts';

function createTemporaryParticipantState() {
  const now = new Date('2026-04-07T10:00:00.000Z');
  let state = createChannel(
    createDefaultChatState(),
    {
      title: 'Runtime review room',
      topic: 'Check temporary participants',
      originSurface: 'chat',
      entryKind: 'group',
      temporaryParticipants: [
        {
          participantId: 'participant-reviewer',
          name: 'RuntimeReviewer',
          provider: 'gemini',
          instance: 'native',
          model: 'gemini-3.1-pro',
          modelSelection: null,
          roleHint: 'Counterpoint',
        },
        {
          participantId: 'participant-verifier',
          name: 'RuntimeVerifier',
          provider: 'claude',
          instance: 'native',
          model: 'claude-sonnet',
          modelSelection: null,
          roleHint: 'Validation',
        },
      ],
      defaultRecipientId: 'participant-reviewer',
    },
    now,
  );
  const channelId = state.channels[0]?.id;
  if (!channelId) {
    throw new Error('Expected created channel id.');
  }

  const appended = appendMessage(
    state,
    channelId,
    {
      senderKind: 'user',
      senderName: 'Kenny',
      body: 'Please review this plan.',
    },
    now,
  );
  state = appended.state;

  return {
    state,
    channelId,
    userMessageId: appended.message.id,
  };
}

test('temporary participants remain explicit targets while room default goes to orchestrator', () => {
  const { state, channelId } = createTemporaryParticipantState();

  const defaultTarget = resolveRoomDefaultRoutingTarget(state, channelId);
  assert.equal(defaultTarget.target?.participantKind, 'orchestrator');
  assert.equal(defaultTarget.target?.participantId, 'orchestrator');
  assert.equal(defaultTarget.defaultTargetReason, 'chat_channel_default');

  const mentionRoute = resolveMentionRoute(
    state,
    channelId,
    'Ask @RuntimeVerifier to validate the proposal.',
    {
      allowDefaultTarget: true,
      explicitTrigger: 'explicit_mention',
    },
  );
  assert.equal(mentionRoute.targets.length, 1);
  assert.equal(mentionRoute.targets[0]?.participantId, 'participant-verifier');
  assert.equal(mentionRoute.targets[0]?.participantName, 'RuntimeVerifier');
});

test('temporary participants build prompts, choice routing, and suppress default rewrite fallback', () => {
  const { state, channelId, userMessageId } = createTemporaryParticipantState();
  const channel = buildChannelView(state, channelId);
  const sourceMessage = channel.messages.find((message) => message.id === userMessageId);
  if (!sourceMessage) {
    throw new Error('Expected source message.');
  }
  const reviewerTarget = resolveMentionRoute(
    state,
    channelId,
    '@RuntimeReviewer please review this plan.',
    {
      allowDefaultTarget: true,
      explicitTrigger: 'explicit_mention',
    },
  ).targets[0];
  if (!reviewerTarget) {
    throw new Error('Expected RuntimeReviewer to resolve as an explicit target.');
  }

  const prompt = buildPromptForTarget(
    state,
    channelId,
    {
      sourceMessage,
      sourceParticipant: null,
      target: reviewerTarget,
      trigger: 'explicit_mention',
    },
  );
  assert.match(prompt.message, /temporary chat participant/i);
  assert.match(prompt.message, /RuntimeReviewer/);
  assert.match(prompt.message, /gemini/i);

  const execution = resolveExecutionMetadataForTarget(state, channelId, reviewerTarget);
  assert.equal(execution.provider, 'gemini');
  assert.equal(execution.model, 'gemini-3.1-pro');

  const reviewerReply = appendMessage(
    state,
    channelId,
    {
      senderKind: 'agent',
      senderName: 'RuntimeReviewer',
      body: 'I have a follow-up question.',
    },
    new Date('2026-04-07T10:01:00.000Z'),
    {
      metadata: {
        targetKind: 'cat',
        targetId: 'participant-reviewer',
      },
    },
  );
  const choiceTarget = resolveChoiceResponseTarget(
    reviewerReply.state,
    buildChannelView(reviewerReply.state, channelId),
    reviewerReply.message.id,
  );
  assert.equal(choiceTarget?.participantId, 'participant-reviewer');
  assert.equal(choiceTarget?.participantName, 'RuntimeReviewer');

  assert.equal(
    shouldRewriteOrchestratorReply(
      '@RuntimeVerifier please take it from here.',
      'Orchestrator',
      buildChannelView(state, channelId),
    ),
    false,
  );
});

test('temporary participants remain resumable through workflow continuation replay', () => {
  const { state, channelId, userMessageId } = createTemporaryParticipantState();
  const readyState = setChannelParticipantLease(
    state,
    channelId,
    'participant-verifier',
    {
      sessionId: 'session-verifier',
      status: 'ready',
    },
    new Date('2026-04-07T10:02:00.000Z'),
  );

  const replay: WorkflowContinuationReplaySnapshot = {
    channelId,
    checkpointId: 'checkpoint-1',
    sourceMessageId: userMessageId,
    sourceParticipant: {
      participantKind: 'cat',
      participantId: 'participant-reviewer',
      participantName: 'RuntimeReviewer',
    },
    targets: [
      {
        participantKind: 'cat',
        participantId: 'participant-verifier',
        participantName: 'RuntimeVerifier',
      },
    ],
    mentionNames: ['RuntimeVerifier'],
    trigger: 'continuation_mention',
    branchStrategy: 'transplant_context',
    workflowStageId: 'continuation_handoff',
    workflowShape: 'sequential',
    reviewRequired: false,
    continuationSource: 'explicit_mentions',
    workflowRecommendation: null,
    unresolvedTargets: [],
    blockedReason: null,
    recordedAt: '2026-04-07T10:02:00.000Z',
    replayState: 'ready',
    replayTrigger: 'retry',
    replayAttemptAt: null,
    replayError: null,
  };

  assert.equal(canResumeWorkflowContinuationReplay(replay, readyState), true);
});
