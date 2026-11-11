import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  RuntimeClient,
  RuntimeSendMessageInput,
  RuntimeSessionInfo,
} from '../src/platform/runtime/client.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  requireChannel,
  setChannelCatExecutionTarget,
  setChannelParticipantLease,
} from '../src/products/chat/state/model/index.ts';
import { routeChannelMessage } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { mergeCompletedDispatchState, createMergedDispatchChatStore } from '../src/products/chat/state/runtime-dispatch/merge.ts';
import { wakeChannelEntryParticipant } from '../src/products/chat/state/runtime-session/activation.ts';
import { resumeRuntimeSession } from '../src/products/chat/state/runtime-session/sessionResume.ts';
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
    catId: requireChannel(state, state.selectedChannelId).catAssignments[0]!.catId,
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
  let createCallCount = 0;
  return {
    closeCalls,
    get createCalls() {
      return createCallCount;
    },
    resumeCalls,
    sentSessionIds,
    async createSession() {
      createCallCount += 1;
      return session;
    },
    async sendMessage(sessionId: string) {
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
    async resumeSession(sessionId: string) {
      resumeCalls.push(sessionId);
      resumed = true;
      return session;
    },
    async closeSession(sessionId: string) {
      closeCalls.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient & {
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

test('runtime session resume failures emit a diagnostic warning', async () => {
  const runtimeClient = {
    async resumeSession() {
      throw new Error('runtime gateway unavailable');
    },
  } as unknown as RuntimeClient;

  const captured = await captureConsoleWarnings(() =>
    resumeRuntimeSession({
      runtimeClient,
      sessionId: 'session-direct-1',
      scope: 'dispatch_stale_recovery',
    }));

  assert.deepEqual(captured.result, {
    attempted: true,
    session: null,
    error: 'runtime gateway unavailable',
  });
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

test('direct-message dispatch surfaces resume failure without creating a replacement', async () => {
  const { state, channelId, participantId } = createDirectState();
  const store = new MemoryChatStore(state);
  let sendCount = 0;
  const closeCalls: string[] = [];
  let createCallCount = 0;
  const runtimeClient = {
    get createCalls() {
      return createCallCount;
    },
    closeCalls,
    async createSession() {
      createCallCount += 1;
      return {
        id: 'session-direct-1',
        provider: 'claude',
        model: 'sonnet',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: 'C:\\tmp\\cats-session-direct-1',
      } satisfies RuntimeSessionInfo;
    },
    async sendMessage() {
      sendCount += 1;
      if (sendCount === 2) {
        throw new Error('Session is closed. Resume it first.');
      }
      return {
        segments: [{ kind: 'text', text: 'reply-1', toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async resumeSession() {
      throw new Error('runtime gateway unavailable');
    },
    async closeSession(sessionId: string) {
      closeCalls.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'closed' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient & {
    closeCalls: string[];
    createCalls: number;
  };

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
  const captured = await captureConsoleWarnings(() =>
    routeChannelMessage(
      first.state,
      channelId,
      {
        body: 'Continue in the same workspace',
        senderName: 'Kenneth',
      },
      runtimeClient,
      new Date('2026-05-07T03:02:00.000Z'),
      { chatStore: store },
    ));

  const channel = requireChannel(captured.result.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.equal(runtimeClient.createCalls, 1);
  assert.deepEqual(runtimeClient.closeCalls, []);
  assert.equal(
    channel.messages.filter((message) => message.metadata.event === 'session_started').length,
    1,
  );
  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'error');
  assert.match(lease?.lastError ?? '', /lane is paused until you reset or retarget/);
  assert.equal(captured.result.results[0]?.status, 'error');
  assert.match(
    captured.result.results[0]?.error ?? '',
    /lane is paused until you reset or retarget/,
  );
  assert.equal(captured.warnings.length, 1);
});

test('direct-message dispatch can replace a stale lease after explicit retarget drift', async () => {
  const { state, channelId, catId, participantId } = createDirectState();
  let createCalls = 0;
  const resumeCalls: string[] = [];
  const sentSessionIds: string[] = [];
  let createCallCount = 0;
  const closeCalls: string[] = [];
  const runtimeClient = {
    async createSession() {
      createCalls += 1;
      return {
        id: createCalls === 1 ? 'session-direct-1' : 'session-direct-2',
        provider: createCalls === 1 ? 'claude' : 'codex',
        model: createCalls === 1 ? 'sonnet' : 'gpt-5.4',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: createCalls === 1
          ? 'C:\\tmp\\cats-session-direct-1'
          : 'C:\\tmp\\cats-session-direct-2',
      } satisfies RuntimeSessionInfo;
    },
    async sendMessage(sessionId: string) {
      sentSessionIds.push(sessionId);
      return {
        segments: [{
          kind: 'text',
          text: `reply-${sentSessionIds.length}`,
          toolName: null,
          toolId: null,
        }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async resumeSession(sessionId: string) {
      resumeCalls.push(sessionId);
      throw new Error('runtime gateway unavailable');
    },
    async closeSession(sessionId: string) {
      closeCalls.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'closed' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient;

  const first = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please create a calculator page',
      senderName: 'Kenneth',
    },
    runtimeClient,
    new Date('2026-05-07T03:01:00.000Z'),
  );
  const closedLeaseState = setChannelParticipantLease(
    first.state,
    channelId,
    participantId,
    {
      status: 'closed',
      lastUsedAt: '2026-05-07T03:01:30.000Z',
    },
    new Date('2026-05-07T03:01:30.000Z'),
  );
  const retargetedState = setChannelCatExecutionTarget(
    closedLeaseState,
    channelId,
    catId,
    {
      provider: 'codex',
      model: 'gpt-5.4',
    },
    new Date('2026-05-07T03:02:00.000Z'),
  );

  const captured = await captureConsoleWarnings(() =>
    routeChannelMessage(
      retargetedState,
      channelId,
      {
        body: 'Continue after the retarget',
        senderName: 'Kenneth',
      },
      runtimeClient,
      new Date('2026-05-07T03:03:00.000Z'),
    ));
  const channel = requireChannel(captured.result.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.deepEqual(resumeCalls, [], 'explicit retarget must not first resume the old provider');
  assert.equal(createCalls, 2);
  assert.deepEqual(sentSessionIds, ['session-direct-1', 'session-direct-2']);
  assert.deepEqual(closeCalls, ['session-direct-1']);
  assert.equal(
    channel.messages.filter((message) => message.metadata.event === 'session_started').length,
    2,
  );
  assert.equal(captured.result.results[0]?.status, 'sent');
  assert.equal(captured.result.results[0]?.sessionId, 'session-direct-2');
  assert.equal(lease?.sessionId, 'session-direct-2');
  assert.equal(lease?.provider, 'codex');
  assert.equal(lease?.model, 'gpt-5.4');
  assert.equal(lease?.status, 'ready');
  assert.equal(lease?.lastError, null);
  assert.equal(captured.warnings.length, 0);
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

for (const status of ['ready', 'error'] as const) {
  test(`dispatch recovery survives a concurrent ${status} update to its old lease`, async () => {
    const { state, channelId, participantId } = createDirectState();
    const now = new Date('2026-11-11T03:39:00Z');
    const runtime = resumableRuntimeStub();
    const baseline = (await routeChannelMessage(state, channelId, { body: 'First' }, runtime, now)).state;
    runtime.sentSessionIds.length = 0;
    const latest = setChannelParticipantLease(baseline, channelId, participantId, {
      status, lastUsedAt: '2026-11-11T03:40:00Z', lastError: status === 'error' ? 'old stream ended' : null,
    }, now);
    const recovered = setChannelParticipantLease(baseline, channelId, participantId, {
      sessionId: 'recovered-session', status: 'ready', lastError: null,
    }, now);
    const merged = mergeCompletedDispatchState(latest, baseline, recovered, channelId, now);
    assert.equal(resolveParticipantLeaseAttachment(requireChannel(merged, channelId), participantId)?.sessionId, 'recovered-session');
    assert.equal(requireChannel(merged, channelId).catAssignments[0]?.execution.lease.sessionId, 'recovered-session');
    const resume = runtime.resumeSession!.bind(runtime);
    runtime.resumeSession = async (id, input) => ({ ...await resume(id, input), id });
    const next = await routeChannelMessage(merged, channelId, { body: 'Continue' }, runtime, now);
    assert.deepEqual(runtime.sentSessionIds, ['recovered-session']);
    assert.equal(runtime.createCalls, 1, 'the next activity must not recover the old session again');
    assert.equal(resolveParticipantLeaseAttachment(requireChannel(next.state, channelId), participantId)?.sessionId, 'recovered-session');
  });
}

test('dispatch recovery preserves an explicit concurrent reset', () => {
  const { state, channelId, participantId } = createDirectState();
  const now = new Date('2026-11-11T03:39:00Z');
  const baseline = setChannelParticipantLease(state, channelId, participantId, { sessionId: 'old-session', status: 'ready' }, now);
  const reset = setChannelParticipantLease(baseline, channelId, participantId, { sessionId: null, status: 'closed' }, now);
  const recovered = setChannelParticipantLease(baseline, channelId, participantId, { sessionId: 'replacement', status: 'ready' }, now);
  const merged = mergeCompletedDispatchState(reset, baseline, recovered, channelId, now);
  assert.equal(resolveParticipantLeaseAttachment(requireChannel(merged, channelId), participantId)?.sessionId, null);
});

test('a recovery merged after DM sleep keeps its new identity closed and releases its worker', async () => {
  const { state, channelId, participantId } = createDirectState();
  const now = new Date('2026-11-11T03:39:00Z');
  const baseline = setChannelParticipantLease(state, channelId, participantId, { sessionId: 'old', status: 'ready' }, now);
  const sleeping = setChannelParticipantLease(baseline, channelId, participantId, { status: 'closed' }, now);
  const recovered = setChannelParticipantLease(baseline, channelId, participantId, { sessionId: 'new', status: 'ready' }, now);
  const merged = mergeCompletedDispatchState(sleeping, baseline, recovered, channelId, now);
  const lease = resolveParticipantLeaseAttachment(requireChannel(merged, channelId), participantId);
  assert.equal(lease?.sessionId, 'new');
  assert.equal(lease?.status, 'closed');
  const runtime = resumableRuntimeStub();
  let gateDepth = 0;
  const writer = createMergedDispatchChatStore({
    chatStore: new MemoryChatStore(sleeping), channelId, baselineState: baseline, now: () => now,
    mutationGate: { async run(_key, operation) { gateDepth++; try { return await operation(); } finally { gateDepth--; } } },
    runtimeClient: { async closeSession(id) { assert.ok(gateDepth > 0, 'cleanup stays under the channel gate'); await runtime.closeSession(id); } },
  });
  const persisted = await writer.write(recovered);
  assert.equal(resolveParticipantLeaseAttachment(requireChannel(persisted, channelId), participantId)?.status, 'closed');
  assert.deepEqual(runtime.closeCalls, ['new']);
});

test('a non-atomic dispatch store releases a candidate after the conversation was removed', async () => {
  const { state, channelId, participantId } = createDirectState();
  const now = new Date('2026-11-11T03:39:00Z');
  const candidate = setChannelParticipantLease(state, channelId, participantId, { sessionId: 'candidate', status: 'ready' }, now);
  const memory = new MemoryChatStore(state);
  const removed = { ...state, channels: [] };
  const runtime = resumableRuntimeStub();
  const writer = createMergedDispatchChatStore({
    chatStore: { read: async () => removed, write: async value => value,
      readCore: memory.readCore.bind(memory), writeCore: memory.writeCore.bind(memory), updateCore: memory.updateCore.bind(memory) },
    channelId, baselineState: state, now: () => now,
    mutationGate: { run: async (_key, operation) => operation() }, runtimeClient: runtime,
  });
  assert.equal((await writer.write(candidate)).channels.length, 0);
  assert.deepEqual(runtime.closeCalls, ['candidate']);
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

test('direct-message room-entry wake reports resume failure without creating a replacement', async () => {
  const { state, channelId, participantId } = createDirectState();
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
  const closeCalls: string[] = [];
  let createCallCount = 0;
  const runtimeClient = {
    get createCalls() {
      return createCallCount;
    },
    async createSession() {
      createCallCount += 1;
      throw new Error('createSession should not be called');
    },
    async sendMessage() {
      throw new Error('sendMessage should not be called');
    },
    async resumeSession() {
      throw new Error('runtime gateway unavailable');
    },
    async closeSession(sessionId: string) {
      closeCalls.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'closed' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient & { createCalls: number };

  const captured = await captureConsoleWarnings(() =>
    wakeChannelEntryParticipant(
      closedLeaseState,
      channelId,
      runtimeClient,
      new Date('2026-05-07T03:03:00.000Z'),
      { observeRuntimeForRevive: true },
    ));
  const channel = requireChannel(captured.result.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.equal(runtimeClient.createCalls, 0);
  assert.deepEqual(closeCalls, []);
  assert.equal(captured.result.result?.status, 'error');
  assert.match(captured.result.result?.error ?? '', /lane is paused until you reset or retarget/);
  assert.equal(lease?.sessionId, 'session-direct-1');
  assert.equal(lease?.status, 'error');
  assert.match(lease?.lastError ?? '', /lane is paused until you reset or retarget/);
  assert.equal(captured.warnings.length, 1);
});

test('direct-message room-entry wake can replace a stale lease after explicit retarget drift', async () => {
  const { state, channelId, catId, participantId } = createDirectState();
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
  const retargetedState = setChannelCatExecutionTarget(
    closedLeaseState,
    channelId,
    catId,
    {
      provider: 'codex',
      model: 'gpt-5.4',
    },
    new Date('2026-05-07T03:02:00.000Z'),
  );
  const resumeCalls: string[] = [];
  let createCallCount = 0;
  const runtimeClient = {
    get createCalls() {
      return createCallCount;
    },
    async createSession() {
      createCallCount += 1;
      return {
        id: 'session-direct-2',
        provider: 'codex',
        model: 'gpt-5.4',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: 'C:\\tmp\\cats-session-direct-2',
      } satisfies RuntimeSessionInfo;
    },
    async sendMessage() {
      throw new Error('sendMessage should not be called');
    },
    async resumeSession(sessionId: string) {
      resumeCalls.push(sessionId);
      throw new Error('runtime gateway unavailable');
    },
    async closeSession() {},
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'closed' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient & { createCalls: number };

  const captured = await captureConsoleWarnings(() =>
    wakeChannelEntryParticipant(
      retargetedState,
      channelId,
      runtimeClient,
      new Date('2026-05-07T03:03:00.000Z'),
      { observeRuntimeForRevive: true },
    ));
  const channel = requireChannel(captured.result.state, channelId);
  const lease = resolveParticipantLeaseAttachment(channel, participantId);

  assert.deepEqual(resumeCalls, [], 'explicit retarget must not first resume the old provider');
  assert.equal(runtimeClient.createCalls, 1);
  assert.equal(captured.result.result?.status, 'started');
  assert.equal(captured.result.result?.sessionId, 'session-direct-2');
  assert.equal(lease?.sessionId, 'session-direct-2');
  assert.equal(lease?.provider, 'codex');
  assert.equal(lease?.model, 'gpt-5.4');
  assert.equal(lease?.status, 'ready');
  assert.equal(lease?.lastError, null);
  assert.equal(captured.warnings.length, 0);
});
