import assert from 'node:assert/strict';
import test from 'node:test';

import type { RuntimeClient, RuntimeSessionInfo } from '../src/platform/runtime/client.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  appendMessage,
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import { routeChannelMessage } from '../src/products/chat/state/runtime-dispatch/routing.ts';
import {
  ClientMessageIdTooLongError,
  assertClientMessageIdLengthCap,
  buildClientMessageFingerprint,
  isClientMessageIdTooLongError,
  normalizeClientMessageId,
} from '../src/products/chat/shared/clientMessageIdentity.ts';

const VALID_CLIENT_MESSAGE_ID = '7c8be70c-0c38-4ef8-a4d0-8e2d9a0f6411';
const SECOND_VALID_CLIENT_MESSAGE_ID = 'd844ee96-fdd4-42be-bafe-95c6d0c8c3d2';

function createDirectState() {
  const now = new Date('2026-05-07T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Client identity lane',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'IdentityCat',
          provider: 'claude',
          instance: 'native',
          model: 'sonnet',
        },
      ],
    },
    now,
  );

  return { state, channelId: state.selectedChannelId };
}

function createRuntimeStub(): RuntimeClient & {
  createCalls: number;
  sentMessages: Array<{ sessionId: string; content: string }>;
} {
  const sentMessages: Array<{ sessionId: string; content: string }> = [];
  let createCalls = 0;
  return {
    get createCalls() {
      return createCalls;
    },
    sentMessages,
    async createSession(): Promise<RuntimeSessionInfo> {
      createCalls += 1;
      return {
        id: `identity-session-${createCalls}`,
        provider: 'claude',
        model: 'sonnet',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: `C:\\tmp\\identity-session-${createCalls}`,
      };
    },
    async sendMessage(sessionId, content) {
      sentMessages.push({ sessionId, content });
      return {
        segments: [{ kind: 'text', text: `reply:${content}`, toolName: null, toolId: null }],
        inputTokens: 1,
        outputTokens: 1,
        tokensUsed: 2,
      };
    },
    async resumeSession(sessionId) {
      return {
        id: sessionId,
        provider: 'claude',
        model: 'sonnet',
        modelSelection: null,
        modelResolution: null,
        status: 'ready',
        cwd: `C:\\tmp\\${sessionId}`,
      };
    },
    async closeSession() {},
    async cancelSession() {},
    async observeSession(sessionId) {
      return { session: { id: sessionId, status: 'ready' } };
    },
    async streamSession() {},
  } as RuntimeClient & {
    createCalls: number;
    sentMessages: Array<{ sessionId: string; content: string }>;
  };
}

function userMessages(state: ReturnType<typeof createDefaultChatState>, channelId: string) {
  return requireChannel(state, channelId).messages.filter((message) =>
    message.senderKind === 'user');
}

async function captureConsoleWarnings<T>(operation: () => Promise<T>): Promise<{
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

test('routeChannelMessage honors a well-formed clientMessageId as the canonical user id', async () => {
  const { state, channelId } = createDirectState();
  const runtime = createRuntimeStub();

  const result = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Hello from an optimistic row',
      senderName: 'Kenneth',
      clientMessageId: VALID_CLIENT_MESSAGE_ID,
      messageMetadata: {
        optimistic: true,
        clientMessageId: 'spoofed',
      },
    },
    runtime,
    new Date('2026-05-07T08:01:00.000Z'),
  );

  assert.equal(result.messageIdentity?.source, 'client');
  assert.equal(result.messageIdentity?.canonicalMessageId, VALID_CLIENT_MESSAGE_ID);
  const message = userMessages(result.state, channelId).find((candidate) =>
    candidate.id === VALID_CLIENT_MESSAGE_ID);
  assert.ok(message);
  assert.equal(message.metadata.optimistic, undefined);
  assert.equal(message.metadata.clientMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(message.metadata.clientMessageIdSource, 'client');
  assert.equal(typeof message.metadata.clientMessageFingerprint, 'string');
});

test('routeChannelMessage treats an equivalent duplicate clientMessageId as idempotent', async () => {
  const { state, channelId } = createDirectState();
  const runtime = createRuntimeStub();
  const first = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Please keep this row stable',
      senderName: 'Kenneth',
      clientMessageId: VALID_CLIENT_MESSAGE_ID,
    },
    runtime,
    new Date('2026-05-07T08:02:00.000Z'),
  );
  const second = await routeChannelMessage(
    first.state,
    channelId,
    {
      body: 'Please keep this row stable   ',
      senderName: 'Kenneth',
      clientMessageId: VALID_CLIENT_MESSAGE_ID,
    },
    runtime,
    new Date('2026-05-07T08:03:00.000Z'),
  );

  assert.equal(second.idempotent, true);
  assert.equal(second.messageIdentity?.source, 'idempotent');
  assert.equal(second.messageIdentity?.canonicalMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(runtime.sentMessages.length, 1);
  assert.equal(
    userMessages(second.state, channelId)
      .filter((message) => message.id === VALID_CLIENT_MESSAGE_ID)
      .length,
    1,
  );
});

test('routeChannelMessage falls back to a server id for non-equivalent clientMessageId collisions', async () => {
  const { state, channelId } = createDirectState();
  const runtime = createRuntimeStub();
  const first = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Original optimistic payload',
      senderName: 'Kenneth',
      clientMessageId: VALID_CLIENT_MESSAGE_ID,
    },
    runtime,
    new Date('2026-05-07T08:04:00.000Z'),
  );
  const { result: second, warnings } = await captureConsoleWarnings(() =>
    routeChannelMessage(
      first.state,
      channelId,
      {
        body: 'Different payload using the same client id',
        senderName: 'Kenneth',
        clientMessageId: VALID_CLIENT_MESSAGE_ID,
      },
      runtime,
      new Date('2026-05-07T08:05:00.000Z'),
    ));

  assert.equal(second.messageIdentity?.source, 'server_fallback');
  assert.equal(second.messageIdentity?.clientMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(second.messageIdentity?.reason, 'collision-equivalence-mismatch');
  assert.equal(warnings.length, 1);
  assert.equal(
    (warnings[0]?.[1] as { feature?: string } | undefined)?.feature,
    'chat_client_message_id_collision',
  );
  assert.notEqual(second.messageIdentity?.canonicalMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(runtime.sentMessages.length, 2);
  const fallbackMessage = userMessages(second.state, channelId).find((message) =>
    message.id === second.messageIdentity?.canonicalMessageId);
  assert.ok(fallbackMessage);
  assert.equal(fallbackMessage.metadata.clientMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(fallbackMessage.metadata.clientMessageIdSource, 'server_fallback');
});

test('routeChannelMessage treats a foreign-sender clientMessageId collision as server fallback', async () => {
  const { state, channelId } = createDirectState();
  const runtime = createRuntimeStub();
  const seeded = appendMessage(
    state,
    channelId,
    {
      senderKind: 'system',
      senderName: 'Cats',
      body: 'Reserved system row',
    },
    new Date('2026-05-07T08:05:30.000Z'),
    {
      clientMessageIdentity: {
        canonicalId: VALID_CLIENT_MESSAGE_ID,
        clientMessageId: VALID_CLIENT_MESSAGE_ID,
        source: 'client',
        fingerprint: 'system-row',
      },
      incrementUnread: false,
    },
  );

  const { result, warnings } = await captureConsoleWarnings(() =>
    routeChannelMessage(
      seeded.state,
      channelId,
      {
        body: 'User payload colliding with system row',
        senderName: 'Kenneth',
        clientMessageId: VALID_CLIENT_MESSAGE_ID,
      },
      runtime,
      new Date('2026-05-07T08:05:31.000Z'),
    ));

  assert.equal(result.messageIdentity?.source, 'server_fallback');
  assert.equal(result.messageIdentity?.reason, 'collision-foreign-sender');
  assert.notEqual(result.messageIdentity?.canonicalMessageId, VALID_CLIENT_MESSAGE_ID);
  assert.equal(warnings.length, 1);
  assert.equal(
    (warnings[0]?.[1] as { feature?: string } | undefined)?.feature,
    'chat_client_message_id_collision',
  );
});

test('routeChannelMessage never idempotently consumes malformed clientMessageId values', async () => {
  const { state, channelId } = createDirectState();
  const runtime = createRuntimeStub();
  const first = await routeChannelMessage(
    state,
    channelId,
    {
      body: 'Malformed id first send',
      senderName: 'Kenneth',
      clientMessageId: 'not-a-v4-uuid',
    },
    runtime,
    new Date('2026-05-07T08:06:00.000Z'),
  );
  const second = await routeChannelMessage(
    first.state,
    channelId,
    {
      body: 'Malformed id first send',
      senderName: 'Kenneth',
      clientMessageId: 'not-a-v4-uuid',
    },
    runtime,
    new Date('2026-05-07T08:07:00.000Z'),
  );

  assert.equal(first.messageIdentity?.source, 'server_fallback');
  assert.equal(second.messageIdentity?.source, 'server_fallback');
  assert.equal(first.messageIdentity?.reason, 'invalid-uuid');
  assert.equal(second.messageIdentity?.reason, 'invalid-uuid');
  assert.notEqual(
    first.messageIdentity?.canonicalMessageId,
    second.messageIdentity?.canonicalMessageId,
  );
  assert.equal(runtime.sentMessages.length, 2);
});

test('clientMessageId validation applies the trimmed 128-character cap', () => {
  assert.deepEqual(normalizeClientMessageId(` ${SECOND_VALID_CLIENT_MESSAGE_ID} `), {
    supplied: true,
    value: SECOND_VALID_CLIENT_MESSAGE_ID,
    tooLong: false,
    wellFormedV4Uuid: true,
  });
  assert.equal(normalizeClientMessageId(`${'a'.repeat(128)} `).tooLong, false);
  assert.equal(normalizeClientMessageId('a'.repeat(129)).tooLong, true);
  assert.throws(
    () => assertClientMessageIdLengthCap('a'.repeat(129)),
    ClientMessageIdTooLongError,
  );
  assert.equal(
    isClientMessageIdTooLongError({ code: 'client_message_id_too_long' }),
    true,
  );
  assert.equal(
    isClientMessageIdTooLongError({ name: 'ClientMessageIdTooLongError' }),
    true,
  );
  assert.equal(
    isClientMessageIdTooLongError({ code: 'something_else' }),
    false,
  );
});

test('client message fingerprint strips optimistic and audit metadata while including choices', () => {
  const base = buildClientMessageFingerprint({
    senderName: 'Kenneth',
    body: 'Pick one',
    choices: [
      {
        question: 'Next?',
        options: [{ id: 'work', label: 'Work' }],
      },
    ],
    messageMetadata: {
      optimistic: true,
      clientMessageId: 'spoofed',
      clientMessageIdSource: 'server_fallback',
      clientMessageFingerprint: 'spoofed-fingerprint',
      custom: 'kept',
    },
  });
  const strippedEquivalent = buildClientMessageFingerprint({
    senderName: 'Kenneth',
    body: 'Pick one',
    choices: [
      {
        question: 'Next?',
        options: [{ id: 'work', label: 'Work' }],
      },
    ],
    messageMetadata: { custom: 'kept' },
  });
  const changedChoices = buildClientMessageFingerprint({
    senderName: 'Kenneth',
    body: 'Pick one',
    choices: [
      {
        question: 'Next?',
        options: [{ id: 'code', label: 'Code' }],
      },
    ],
    messageMetadata: { custom: 'kept' },
  });

  assert.equal(base, strippedEquivalent);
  assert.notEqual(base, changedChoices);
});
