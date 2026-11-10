import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  RuntimeClient,
  RuntimeSendMessageInput,
  RuntimeSessionInfo,
} from '../src/platform/runtime/client.ts';
import {
  CatsRuntimeClient,
  RuntimeRequestError,
  RuntimeTurnError,
} from '../src/platform/runtime/client.ts';
import { readRuntimeNdjsonResponse } from '../src/runtime/clientStreams.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createCat,
  createChannel,
  requireChannel,
  setChannelParticipantLease,
} from '../src/products/chat/state/model/index.ts';
import { routeChannelMessage } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import {
  classifyRuntimeDispatchRecoveryError,
  describeProviderSessionUnavailableError,
} from '../src/products/chat/state/runtime-dispatch/recovery.ts';
import { wakeChannelEntryParticipant } from '../src/products/chat/state/runtime-session/activation.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { resolveParticipantLeaseAttachment } from '../src/products/chat/shared/channelParticipants.ts';
import type { ChatState } from '../src/products/chat/api/contracts.ts';

// A workspace outside `.cats/runtime/sessions/`: the channel's default spawn cwd
// would not reproduce it, so only an explicit carry-over keeps it. Pure string
// contract; the stubs below never touch the filesystem.
const LANE_WORKSPACE = path.join(tmpdir(), 'cats-provider-rotation', 'companion-workspace');
const GROK_GONE = 'No saved copy of session 01a1c2b4-9e24-74c1-b18d-48a11e123bb3 was found remotely. '
  + 'Check the id, or run `grok --resume` to pick a session.';
const CLAUDE_GONE = 'No conversation found with session ID: 2f0c3a7e-1b9d-4c55-9d7e-6a1f0e2b3c4d';

const UNAVAILABLE_SIGNALS: Array<{ name: string; error: () => Error }> = [
  {
    name: 'the typed in-stream code',
    error: () => new RuntimeTurnError('The provider session is gone.', 'provider_session_unavailable'),
  },
  {
    name: 'HTTP 410 with the code',
    error: () => Object.assign(new Error('Provider session unavailable; create a new session.'), {
      status: 410,
      code: 'provider_session_unavailable',
    }),
  },
  { name: 'the grok text', error: () => new Error(GROK_GONE) },
  { name: 'the claude text', error: () => new Error(CLAUDE_GONE) },
];

interface RotationStub {
  client: RuntimeClient;
  created: Array<Record<string, unknown>>;
  closed: string[];
  resumed: string[];
  sent: Array<{ sessionId: string; content: string; input?: RuntimeSendMessageInput }>;
}

function rotationRuntimeStub(options: {
  fail: (sessionId: string, sendIndex: number) => Error | null;
  resume?: (sessionId: string) => RuntimeSessionInfo;
}): RotationStub {
  const created: Array<Record<string, unknown>> = [];
  const closed: string[] = [];
  const resumed: string[] = [];
  const sent: RotationStub['sent'] = [];
  const client = {
    async createSession(input: Record<string, unknown>) {
      created.push(input);
      const id = `session-${created.length}`;
      return {
        id,
        provider: 'grok',
        model: 'grok-4.7',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: typeof input.cwd === 'string' && input.cwd ? input.cwd : LANE_WORKSPACE,
      } satisfies RuntimeSessionInfo;
    },
    async sendMessage(sessionId: string, content: string, input?: RuntimeSendMessageInput) {
      sent.push({ sessionId, content, input });
      const error = options.fail(sessionId, sent.length);
      if (error) throw error;
      return {
        segments: [{ kind: 'text', text: `reply from ${sessionId}`, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async resumeSession(sessionId: string) {
      resumed.push(sessionId);
      if (options.resume) return options.resume(sessionId);
      throw new Error('resumeSession should not be called');
    },
    async closeSession(sessionId: string) {
      closed.push(sessionId);
    },
    async cancelSession() {},
    async observeSession(sessionId: string) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async streamSession() {},
  } as unknown as RuntimeClient;
  return { client, created, closed, resumed, sent };
}

function createDirectLane(): { state: ChatState; channelId: string; participantId: string } {
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Provider session rotation',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [{ name: 'Tabby', provider: 'grok', instance: 'native', model: 'grok-4.7' }],
    },
    new Date('2026-11-11T01:00:00.000Z'),
  );
  const channel = requireChannel(state, state.selectedChannelId);
  return { state, channelId: channel.id, participantId: channel.catAssignments[0]!.participantId };
}

function createRoom(): { state: ChatState; channelId: string; participantId: string } {
  const now = new Date('2026-11-11T01:00:00.000Z');
  let state = createCat(createDefaultChatState(), { name: 'Reviewer', provider: 'grok', model: 'grok-4.7' }, now);
  const reviewerId = state.cats[0]!.id;
  state = createCat(state, { name: 'Observer', provider: 'claude', model: 'claude-sonnet' }, now);
  const observerId = state.cats[0]!.id;
  state = createChannel(state, {
    title: 'Review room',
    topic: 'Rooms rotate too',
    originSurface: 'chat',
    participantCatIds: [reviewerId, observerId],
    defaultRecipientId: reviewerId,
  }, now);
  const channel = requireChannel(state, state.selectedChannelId);
  const participantId = channel.catAssignments.find((row) => row.catId === reviewerId)!.participantId;
  return { state, channelId: channel.id, participantId };
}

function rotationNotices(state: ChatState, channelId: string) {
  return requireChannel(state, channelId).messages
    .filter((message) => message.metadata.event === 'session_rotated');
}

test('an in-stream error event keeps Runtime\'s code', async () => {
  const body = [
    JSON.stringify({ type: 'error', text: GROK_GONE, code: 'provider_session_unavailable' }),
  ].join('\n');
  await assert.rejects(readRuntimeNdjsonResponse(new Response(body)), (error: unknown) => {
    assert.ok(error instanceof RuntimeTurnError);
    assert.equal(error.message, GROK_GONE);
    assert.equal(error.code, 'provider_session_unavailable');
    return true;
  });
  await assert.rejects(
    readRuntimeNdjsonResponse(new Response(JSON.stringify({ type: 'error', text: 'boom' }))),
    (error: unknown) => error instanceof RuntimeTurnError && error.code === undefined,
  );
});

test('a refused send keeps its HTTP status and Runtime code', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ error: 'Provider session unavailable; create a new session.', code: 'provider_session_unavailable' }),
    { status: 410, headers: { 'content-type': 'application/json' } },
  )) as typeof fetch;
  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    await assert.rejects(client.sendMessage('session-1', 'hello'), (error: unknown) => {
      assert.ok(error instanceof RuntimeRequestError);
      assert.equal(error.status, 410);
      assert.equal(error.code, 'provider_session_unavailable');
      assert.match(error.message, /Provider session unavailable/u);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider session unavailable is its own class, matched by code first and then provider text', () => {
  assert.deepEqual(
    classifyRuntimeDispatchRecoveryError('anything', { code: 'provider_session_unavailable' }),
    { reason: 'provider_session_unavailable', retryable: false },
  );
  assert.equal(classifyRuntimeDispatchRecoveryError(GROK_GONE)?.reason, 'provider_session_unavailable');
  assert.equal(classifyRuntimeDispatchRecoveryError(CLAUDE_GONE)?.reason, 'provider_session_unavailable');
  assert.equal(
    classifyRuntimeDispatchRecoveryError('No saved copy of session abc was found. Check the id.')?.reason,
    'provider_session_unavailable',
    'the grok marker does not depend on the word "remotely"',
  );
  assert.equal(classifyRuntimeDispatchRecoveryError('Session is closed. Resume it first.')?.reason, 'stale_session');
  assert.equal(classifyRuntimeDispatchRecoveryError('Native session is unavailable'), null);
  // A typed code survives in a lease's lastError text.
  const stored = describeProviderSessionUnavailableError('Gone.');
  assert.equal(classifyRuntimeDispatchRecoveryError(stored)?.reason, 'provider_session_unavailable');
});

for (const signal of UNAVAILABLE_SIGNALS) {
  test(`direct lane rotates on ${signal.name}: same cwd, transplant, visible notice, no resume`, async () => {
    const { state, channelId, participantId } = createDirectLane();
    const stub = rotationRuntimeStub({
      fail: (sessionId, sendIndex) => (sessionId === 'session-1' && sendIndex === 2 ? signal.error() : null),
    });
    const store = new MemoryChatStore(state);

    const first = await routeChannelMessage(state, channelId, {
      body: 'Watch the birds with me',
      senderName: 'Owner',
    }, stub.client, new Date('2026-11-11T01:01:00.000Z'), { chatStore: store });
    const second = await routeChannelMessage(first.state, channelId, {
      body: 'Are they back yet?',
      senderName: 'Owner',
    }, stub.client, new Date('2026-11-11T01:02:00.000Z'), { chatStore: store });

    const channel = requireChannel(second.state, channelId);
    const lease = resolveParticipantLeaseAttachment(channel, participantId);
    assert.deepEqual(stub.resumed, [], 'an unavailable provider session is never resumed');
    assert.deepEqual(stub.closed, ['session-1']);
    assert.equal(stub.created.length, 2);
    assert.equal(stub.created[1]?.cwd, LANE_WORKSPACE, 'the replacement keeps the old lease cwd');
    assert.deepEqual(stub.sent.map((row) => row.sessionId), ['session-1', 'session-1', 'session-2']);
    assert.equal(second.results[0]?.status, 'sent');
    assert.equal(second.results[0]?.sessionId, 'session-2');
    assert.equal(lease?.sessionId, 'session-2');
    assert.equal(lease?.status, 'ready');
    assert.equal(lease?.cwd, LANE_WORKSPACE);

    const retried = stub.sent.at(-1)!;
    assert.match(retried.input?.instructions ?? '', /Same conversation continuity transcript:/u);
    assert.match(retried.input?.instructions ?? '', /\[user:Owner\] Watch the birds with me/u);
    assert.match(retried.input?.instructions ?? '', /\[agent:Tabby\] reply from session-1/u);
    assert.equal(retried.input?.context?.metadata?.continuityMode, 'full_transplant');

    const notices = rotationNotices(second.state, channelId);
    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.senderKind, 'system');
    assert.equal(notices[0]?.metadata.verbosity, undefined, 'the notice is visible by default');
    assert.equal(notices[0]?.metadata.previousSessionId, 'session-1');
    assert.match(notices[0]?.body ?? '', /continues in a new session in the same workspace/u);
  });
}

test('a room rotates on the typed code without a resume and keeps the participant cwd', async () => {
  const { state, channelId, participantId } = createRoom();
  const stub = rotationRuntimeStub({
    fail: (sessionId, sendIndex) => (sessionId === 'session-1' && sendIndex === 2
      ? new RuntimeTurnError('gone', 'provider_session_unavailable')
      : null),
  });

  const first = await routeChannelMessage(state, channelId, { body: '@Reviewer First review turn' },
    stub.client, new Date('2026-11-11T01:01:00.000Z'));
  const second = await routeChannelMessage(first.state, channelId, { body: '@Reviewer Second review turn' },
    stub.client, new Date('2026-11-11T01:02:00.000Z'), { runtimeRecovery: { staleSessionRetryLimit: 1 } });

  const lease = resolveParticipantLeaseAttachment(requireChannel(second.state, channelId), participantId);
  assert.deepEqual(stub.resumed, []);
  assert.deepEqual(stub.closed, ['session-1']);
  assert.equal(stub.created[1]?.cwd, LANE_WORKSPACE);
  assert.equal(lease?.sessionId, 'session-2');
  assert.match(stub.sent.at(-1)?.input?.instructions ?? '', /\[user:User\] @Reviewer First review turn/u);
  assert.equal(rotationNotices(second.state, channelId).length, 1);
});

test('a replacement that fails the same way stops after one rotation and keeps the new attachment', async () => {
  const { state, channelId, participantId } = createDirectLane();
  const stub = rotationRuntimeStub({
    fail: (_sessionId, sendIndex) => (sendIndex >= 2 ? new Error(GROK_GONE) : null),
  });

  const first = await routeChannelMessage(state, channelId, { body: 'Hello', senderName: 'Owner' },
    stub.client, new Date('2026-11-11T01:01:00.000Z'));
  const second = await routeChannelMessage(first.state, channelId, { body: 'Hello again', senderName: 'Owner' },
    stub.client, new Date('2026-11-11T01:02:00.000Z'));

  const lease = resolveParticipantLeaseAttachment(requireChannel(second.state, channelId), participantId);
  assert.equal(stub.created.length, 2, 'one rotation per send, never a loop');
  assert.deepEqual(stub.closed, ['session-1']);
  assert.deepEqual(stub.sent.map((row) => row.sessionId), ['session-1', 'session-1', 'session-2']);
  assert.equal(second.results[0]?.status, 'error');
  assert.match(second.results[0]?.error ?? '', /No saved copy of session/u);
  assert.equal(lease?.sessionId, 'session-2');
  assert.equal(lease?.status, 'error');
  assert.equal(lease?.cwd, LANE_WORKSPACE);
  assert.equal(
    classifyRuntimeDispatchRecoveryError(lease?.lastError ?? '')?.reason,
    'provider_session_unavailable',
    'the stored error keeps its class for the next wake',
  );
});

function directLaneWithLease(patch: Record<string, unknown>) {
  const lane = createDirectLane();
  const state = setChannelParticipantLease(lane.state, lane.channelId, lane.participantId, {
    sessionId: 'session-old',
    cwd: LANE_WORKSPACE,
    provider: 'grok',
    instance: 'native',
    model: 'grok-4.7',
    laneId: null,
    startedAt: '2026-11-11T00:30:00.000Z',
    lastUsedAt: '2026-11-11T00:30:00.000Z',
    ...patch,
  }, new Date('2026-11-11T00:30:00.000Z'));
  return { ...lane, state };
}

test('a wake rotates a lease paused on an unavailable provider session, without resuming it', async () => {
  const { state, channelId, participantId } = directLaneWithLease({
    status: 'error',
    lastError: `Direct lane runtime session session-old could not be resumed; lane is paused until you reset or retarget. ${GROK_GONE}`,
  });
  const stub = rotationRuntimeStub({ fail: () => null });

  const awakened = await wakeChannelEntryParticipant(state, channelId, stub.client,
    new Date('2026-11-11T01:05:00.000Z'), { observeRuntimeForRevive: true });

  const lease = resolveParticipantLeaseAttachment(requireChannel(awakened.state, channelId), participantId);
  assert.deepEqual(stub.resumed, []);
  assert.deepEqual(stub.closed, ['session-old']);
  assert.equal(stub.created.length, 1);
  assert.equal(stub.created[0]?.cwd, LANE_WORKSPACE);
  assert.equal(awakened.result?.status, 'started');
  assert.equal(lease?.sessionId, 'session-1');
  assert.equal(lease?.status, 'ready');
  assert.equal(rotationNotices(awakened.state, channelId).length, 1);
});

test('a wake whose resume Runtime refuses with the code rotates instead of pausing the lane', async () => {
  const { state, channelId, participantId } = directLaneWithLease({ status: 'closed' });
  const stub = rotationRuntimeStub({
    fail: () => null,
    resume: () => {
      throw Object.assign(new Error('Provider session unavailable; create a new session.'), {
        status: 410,
        code: 'provider_session_unavailable',
      });
    },
  });

  const awakened = await wakeChannelEntryParticipant(state, channelId, stub.client,
    new Date('2026-11-11T01:05:00.000Z'), { observeRuntimeForRevive: true });

  const lease = resolveParticipantLeaseAttachment(requireChannel(awakened.state, channelId), participantId);
  assert.deepEqual(stub.resumed, ['session-old']);
  assert.deepEqual(stub.closed, ['session-old']);
  assert.equal(stub.created[0]?.cwd, LANE_WORKSPACE);
  assert.equal(lease?.sessionId, 'session-1');
  assert.equal(lease?.status, 'ready');
  assert.doesNotMatch(lease?.lastError ?? '', /lane is paused/u);
  assert.equal(rotationNotices(awakened.state, channelId).length, 1);
});

test('any other resume failure still pauses the direct lane', async () => {
  const { state, channelId, participantId } = directLaneWithLease({ status: 'closed' });
  const stub = rotationRuntimeStub({
    fail: () => null,
    resume: () => {
      throw new Error('runtime gateway unavailable');
    },
  });

  const originalWarn = console.warn;
  console.warn = () => {};
  let awakened: Awaited<ReturnType<typeof wakeChannelEntryParticipant>>;
  try {
    awakened = await wakeChannelEntryParticipant(state, channelId, stub.client,
      new Date('2026-11-11T01:05:00.000Z'), { observeRuntimeForRevive: true });
  } finally {
    console.warn = originalWarn;
  }

  const lease = resolveParticipantLeaseAttachment(requireChannel(awakened.state, channelId), participantId);
  assert.equal(stub.created.length, 0);
  assert.deepEqual(stub.closed, []);
  assert.equal(lease?.sessionId, 'session-old');
  assert.equal(lease?.status, 'error');
  assert.match(lease?.lastError ?? '', /lane is paused until you reset or retarget/u);
  assert.equal(rotationNotices(awakened.state, channelId).length, 0);
});
