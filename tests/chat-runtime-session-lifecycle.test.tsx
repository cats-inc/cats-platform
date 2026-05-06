import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeClient, RuntimeSessionInfo } from '../src/platform/runtime/client.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  requireChannel,
  setChannelParticipantLease,
} from '../src/products/chat/state/model/index.ts';
import { routeChannelMessage } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { mergeCompletedDispatchState } from '../src/products/chat/state/runtime-dispatch/merge.ts';
import { wakeChannelEntryParticipant } from '../src/products/chat/state/runtime-session/activation.ts';
import { tryResumeRuntimeSession } from '../src/products/chat/state/runtime-session/sessionResume.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { resolveParticipantLeaseAttachment } from '../src/products/chat/shared/channelParticipants.ts';

function createDirectState() {
  const now = new Date('2026-05-07T03:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct session lifecycle',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'LifecycleCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );

  return {
    state,
    channelId: state.selectedChannelId,
    participantId: requireChannel(state, state.selectedChannelId).catAssignments[0]!.participantId,
  };
}

function resumableRuntimeStub(): RuntimeClient & {
  closeCalls: string[];
  createCalls: number;
  resumeCalls: string[];
  sentSessionIds: string[];
} {
  const session: RuntimeSessionInfo = {
    id: 'session-direct-1',
    provider: 'claude',
    model: 'sonnet',
    modelSelection: null,
    modelResolution: null,
    status: 'ready',
    cwd: 'C:\\tmp\\cats-session-direct-1',
  };
  let sendCount = 0;
  let resumed = false;
  const closeCalls: string[] = [];
  const resumeCalls: string[] = [];
  const sentSessionIds: string[] = [];

  return {
    closeCalls,
    createCalls: 0,
    resumeCalls,
    sentSessionIds,
    async createSession() {
      this.createCalls += 1;
      return session;
    },
    async sendMessage(sessionId) {
      sendCount += 1;
      if (sendCount === 2 && !resumed) {
        throw new Error('Session is closed. Resume it first.');
      }
      sentSessionIds.push(sessionId);
      return {
        segments: [{ kind: 'text', text: `reply-${sendCount}`, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async resumeSession(sessionId) {
      resumeCalls.push(sessionId);
      resumed = true;
      return session;
    },
    async closeSession(sessionId) {
      closeCalls.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async streamSession() {},
  } as RuntimeClient & {
    closeCalls: string[];
    createCalls: number;
    resumeCalls: string[];
    sentSessionIds: string[];
  };
}

async function captureConsoleWarnings<T>(
  operation: () => T | Promise<T>,
): Promise<{
  result: T;
  warnings: unknown[][];
}> {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };
  try {
    return {
      result: await operation(),
      warnings,
    };
  } finally {
    console.warn = originalWarn;
  }
}

test('runtime session resume failures emit a diagnostic warning before fallback', async () => {
  const runtimeClient = {
    async resumeSession() {
      throw new Error('runtime gateway unavailable');
    },
  } as RuntimeClient;

  const captured = await captureConsoleWarnings(() =>
    tryResumeRuntimeSession({
      runtimeClient,
      sessionId: 'session-direct-1',
      scope: 'dispatch_stale_recovery',
    }));

  assert.equal(captured.result, null);
  assert.equal(captured.warnings.length, 1);
  assert.match(String(captured.warnings[0]?.[0]), /Failed to resume runtime session/);
  const metadata = captured.warnings[0]?.[1] as Record<string, unknown>;
  assert.equal(metadata.feature, 'runtime_session_resume');
  assert.equal(metadata.scope, 'dispatch_stale_recovery');
  assert.equal(metadata.sessionId, 'session-direct-1');
  assert.equal(metadata.error, 'runtime gateway unavailable');
});

test('direct-message dispatch resumes a stale runtime session instead of creating a replacement', async () => {
  const { state, channelId, participantId } = createDirectState();
  const store = new MemoryChatStore(state);
  const runtimeClient = resumableRuntimeStub();

  const first = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please create a calculator page',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-07T03:01:00.000Z'),
    { chatStore: store },
  );
  const second = await routeChannelMessage(
    first.state,
    channelId,
    {
      body: 'Continue in the same workspace',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-07T03:02:00.000Z'),
    { chatStore: store },
  );

  const channel = requireChannel(second.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.equal(runtimeClient.createCalls, 1);
  assert.deepEqual(runtimeClient.resumeCalls, ['session-direct-1']);
  assert.deepEqual(runtimeClient.closeCalls, []);
  assert.deepEqual(runtimeClient.sentSessionIds, ['session-direct-1', 'session-direct-1']);
  assert.equal(
    channel.messages.filter((message) => message.metadata.event === 'session_started').length,
    1,
  );
  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'ready');
  assert.equal(channel.chatCwd, 'C:\\tmp\\cats-session-direct-1');
});

test('dispatch merge preserves ready lease advancement for the same runtime session', () => {
  const { state, channelId, participantId } = createDirectState();
  const baseline = setChannelParticipantLease(
    state,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-1',
      status: 'initializing',
      cwd: 'C:\\tmp\\cats-session-direct-1',
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      laneId: 'lane-direct-1',
      startedAt: '2026-05-07T03:00:30.000Z',
      lastUsedAt: '2026-05-07T03:00:30.000Z',
    },
    new Date('2026-05-07T03:00:30.000Z'),
  );
  const latest = appendMessage(
    baseline,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Stream attached.',
    },
    new Date('2026-05-07T03:00:40.000Z'),
    { metadata: { event: 'stream_attached' } },
  ).state;
  const dispatchReady = appendMessage(
    setChannelParticipantLease(
      baseline,
      channelId,
      participantId,
      {
        status: 'ready',
        lastError: null,
        lastUsedAt: '2026-05-07T03:01:00.000Z',
      },
      new Date('2026-05-07T03:01:00.000Z'),
    ),
    channelId,
    {
      senderKind: 'agent',
      senderName: 'LifecycleCat',
      body: 'Done.',
    },
    new Date('2026-05-07T03:01:00.000Z'),
  ).state;

  const merged = mergeCompletedDispatchState(
    latest,
    baseline,
    dispatchReady,
    channelId,
    new Date('2026-05-07T03:01:01.000Z'),
  );
  const channel = requireChannel(merged, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'ready');
  assert.equal(
    channel.messages.some((message) => message.metadata.event === 'stream_attached'),
    true,
  );
  assert.equal(
    channel.messages.some((message) => message.senderKind === 'agent' && message.body === 'Done.'),
    true,
  );
});

test('dispatch merge keeps terminal dispatch lease status for the same runtime session', () => {
  const { state, channelId, participantId } = createDirectState();
  const baseline = setChannelParticipantLease(
    state,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-1',
      status: 'ready',
      cwd: 'C:\\tmp\\cats-session-direct-1',
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      laneId: 'lane-direct-1',
      startedAt: '2026-05-07T03:00:30.000Z',
      lastUsedAt: '2026-05-07T03:00:30.000Z',
    },
    new Date('2026-05-07T03:00:30.000Z'),
  );
  const latest = appendMessage(
    baseline,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Runtime',
      body: 'Unrelated product write.',
    },
    new Date('2026-05-07T03:00:40.000Z'),
    { metadata: { event: 'unrelated_product_write' } },
  ).state;
  const dispatchClosed = setChannelParticipantLease(
    baseline,
    channelId,
    participantId,
    {
      status: 'closed',
      lastError: null,
      lastUsedAt: '2026-05-07T03:01:00.000Z',
    },
    new Date('2026-05-07T03:01:00.000Z'),
  );

  const merged = mergeCompletedDispatchState(
    latest,
    baseline,
    dispatchClosed,
    channelId,
    new Date('2026-05-07T03:01:01.000Z'),
  );
  const lease = resolveParticipantLeaseAttachment(requireChannel(merged, channelId), participantId);

  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'closed');
});

test('dispatch merge warns when concurrent session rotations choose latest lease', async () => {
  const { state, channelId, participantId } = createDirectState();
  const baseline = setChannelParticipantLease(
    state,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-1',
      status: 'ready',
      cwd: 'C:\\tmp\\cats-session-direct-1',
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      laneId: 'lane-direct-1',
      startedAt: '2026-05-07T03:00:30.000Z',
      lastUsedAt: '2026-05-07T03:00:30.000Z',
    },
    new Date('2026-05-07T03:00:30.000Z'),
  );
  const latest = setChannelParticipantLease(
    baseline,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-3',
      status: 'ready',
      cwd: 'C:\\tmp\\cats-session-direct-3',
      lastUsedAt: '2026-05-07T03:01:00.000Z',
    },
    new Date('2026-05-07T03:01:00.000Z'),
  );
  const dispatch = setChannelParticipantLease(
    baseline,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-2',
      status: 'ready',
      cwd: 'C:\\tmp\\cats-session-direct-2',
      lastUsedAt: '2026-05-07T03:01:10.000Z',
    },
    new Date('2026-05-07T03:01:10.000Z'),
  );

  const captured = await captureConsoleWarnings(() =>
    mergeCompletedDispatchState(
      latest,
      baseline,
      dispatch,
      channelId,
      new Date('2026-05-07T03:01:11.000Z'),
    ));
  const lease = resolveParticipantLeaseAttachment(
    requireChannel(captured.result, channelId),
    participantId,
  );

  assert.equal(lease?.sessionId, 'session-direct-3');
  assert.equal(captured.warnings.length, 1);
  assert.match(String(captured.warnings[0]?.[0]), /Concurrent runtime session lease rotation/);
  const metadata = captured.warnings[0]?.[1] as Record<string, unknown>;
  assert.equal(metadata.feature, 'runtime_session_lease_merge');
  assert.equal(metadata.reason, 'concurrent_session_rotation');
  assert.equal(metadata.baselineSessionId, 'session-direct-1');
  assert.equal(metadata.latestSessionId, 'session-direct-3');
  assert.equal(metadata.dispatchSessionId, 'session-direct-2');
});

test('direct-message room-entry wake resumes a closed lease before creating a replacement', async () => {
  const { state, channelId, participantId } = createDirectState();
  const runtimeClient = resumableRuntimeStub();
  const closedLeaseState = setChannelParticipantLease(
    state,
    channelId,
    participantId,
    {
      sessionId: 'session-direct-1',
      status: 'closed',
      cwd: 'C:\\tmp\\cats-session-direct-1',
      provider: 'claude',
      instance: 'native',
      model: 'sonnet',
      laneId: 'lane-direct-1',
      startedAt: '2026-05-07T03:00:30.000Z',
      lastUsedAt: '2026-05-07T03:00:30.000Z',
    },
    new Date('2026-05-07T03:00:30.000Z'),
  );

  const awakened = await wakeChannelEntryParticipant(
    closedLeaseState,
    channelId,
    runtimeClient,
    new Date('2026-05-07T03:03:00.000Z'),
    { observeRuntimeForRevive: true },
  );
  const channel = requireChannel(awakened.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.equal(runtimeClient.createCalls, 0);
  assert.deepEqual(runtimeClient.resumeCalls, ['session-direct-1']);
  assert.deepEqual(runtimeClient.closeCalls, []);
  assert.equal(awakened.result?.sessionId, 'session-direct-1');
  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'ready');
});
