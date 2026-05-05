import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldBridgeTelegramProductIntentCommand } from '../src/server/telegramProductIntentCommands.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import {
  createChannel,
  requireChannel,
} from '../src/products/chat/state/model/index.ts';
import {
  beginChannelMessageDispatch,
} from '../src/products/chat/state/runtime-dispatch/routing.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import type { RuntimeClient } from '../src/platform/runtime/client.ts';

function runtimeStub(onClose?: () => void): RuntimeClient {
  return {
    async closeSession() {
      onClose?.();
    },
  } as RuntimeClient;
}

function createDirectState() {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: '',
      topic: 'Direct work intake',
      originSurface: 'chat',
      entryKind: 'direct',
      roomMode: 'direct_message',
      cats: [
        {
          name: 'ConciergeCat',
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
  };
}

test('beginChannelMessageDispatch records direct product intent as posture event without runtime dispatch', async () => {
  const { state, channelId } = createDirectState();
  const store = new MemoryChatStore(state);
  let closeSessionCalls = 0;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(() => {
      closeSessionCalls += 1;
    }),
    new Date('2026-05-06T08:01:00.000Z'),
    {
      chatStore: store,
    },
  );

  const channel = requireChannel(begun.state, channelId);
  const [userMessage, ackMessage] = channel.messages.slice(-2);
  const productIntentMetadata = userMessage?.metadata.productIntentCommand as
    | { command?: unknown; source?: unknown }
    | undefined;
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | {
        command?: unknown;
        previousPosture?: unknown;
        posture?: unknown;
        changed?: unknown;
        sourceTransport?: unknown;
        sourceChannelId?: unknown;
        audienceCatId?: unknown;
      }
    | undefined;
  const core = await store.readCore();
  const segment = core.segments.find((candidate) =>
    candidate.metadata.event === 'product_intent_posture_changed');
  const segmentPostureChange = segment?.metadata.directSlashModePostureChange as
    | { posture?: unknown; sourceChannelId?: unknown }
    | undefined;

  assert.equal(begun.preparedTurn, null);
  assert.deepEqual(begun.results, []);
  assert.equal(closeSessionCalls, 0);
  assert.equal(userMessage?.body, '/work clarify the MVP');
  assert.equal(productIntentMetadata?.command, 'work');
  assert.equal(productIntentMetadata?.source, 'web');
  assert.equal(ackMessage?.senderKind, 'system');
  assert.equal(ackMessage?.metadata.event, 'product_intent_posture_changed');
  assert.equal(ackMessage?.metadata.accepted, true);
  assert.equal(postureChange?.command, 'work');
  assert.equal(postureChange?.previousPosture, null);
  assert.equal(postureChange?.posture, 'work');
  assert.equal(postureChange?.changed, true);
  assert.equal(postureChange?.sourceTransport, 'web');
  assert.equal(postureChange?.sourceChannelId, channelId);
  assert.equal(postureChange?.audienceCatId, state.cats[0]?.id);
  assert.equal(segment?.kind, 'system');
  assert.equal(segment?.status, 'complete');
  assert.equal(segment?.metadata.sourceMessageId, userMessage?.id);
  assert.equal(segment?.metadata.activeProductPosture, 'work');
  assert.equal(segmentPostureChange?.posture, 'work');
  assert.equal(segmentPostureChange?.sourceChannelId, channelId);
});

test('beginChannelMessageDispatch rejects product intent posture changes outside direct lanes', async () => {
  const now = new Date('2026-05-06T08:00:00.000Z');
  const state = createChannel(
    createDefaultChatState(),
    {
      title: 'Group room',
      topic: 'Group work intake',
      originSurface: 'chat',
      roomMode: 'chat_channel',
    },
    now,
  );
  const channelId = state.selectedChannelId;

  const begun = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/code implement the change',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
  );

  const channel = requireChannel(begun.state, channelId);
  const ackMessage = channel.messages.at(-1);

  assert.equal(begun.preparedTurn, null);
  assert.equal(ackMessage?.senderKind, 'system');
  assert.equal(ackMessage?.metadata.event, 'product_intent_unsupported_context');
  assert.equal(ackMessage?.metadata.accepted, false);
  assert.equal(ackMessage?.metadata.directSlashModePostureChange, undefined);
});

test('beginChannelMessageDispatch marks repeated product posture commands as unchanged', async () => {
  const { state, channelId } = createDirectState();
  const first = await beginChannelMessageDispatch(
    state,
    channelId,
    {
      body: '/work clarify the MVP',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:01:00.000Z'),
  );
  const second = await beginChannelMessageDispatch(
    first.state,
    channelId,
    {
      body: '/work',
      senderName: 'Kenneth',
    },
    runtimeStub(),
    new Date('2026-05-06T08:02:00.000Z'),
  );

  const ackMessage = requireChannel(second.state, channelId).messages.at(-1);
  const postureChange = ackMessage?.metadata.directSlashModePostureChange as
    | { previousPosture?: unknown; posture?: unknown; changed?: unknown }
    | undefined;

  assert.equal(postureChange?.previousPosture, 'work');
  assert.equal(postureChange?.posture, 'work');
  assert.equal(postureChange?.changed, false);
});

test('Telegram product intent slash commands bridge into chat instead of transport command handling', () => {
  assert.equal(shouldBridgeTelegramProductIntentCommand('/work@CatsBot clarify scope'), true);
  assert.equal(shouldBridgeTelegramProductIntentCommand('/help'), false);
});
