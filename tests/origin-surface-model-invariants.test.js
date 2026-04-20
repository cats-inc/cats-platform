import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel,
  createParallelChatGroup,
} from '../build/server/products/chat/state/model/index.js';

test('state-model channel create preserves explicit originSurface and still defaults missing ownership to chat', () => {
  const baseState = createDefaultChatState();

  const workState = createChannel(baseState, {
    title: 'Work owned room',
    topic: 'Typed product-owned create should keep work ownership.',
    originSurface: 'work',
    skipBossCatGreeting: true,
  });
  assert.equal(workState.channels[0]?.originSurface, 'work');

  const defaultedState = createChannel(baseState, {
    title: 'Legacy room',
    topic: 'Model helper still tolerates missing originSurface for now.',
    skipBossCatGreeting: true,
  });
  assert.equal(defaultedState.channels[0]?.originSurface, 'chat');
});

test('state-model parallel create preserves explicit originSurface and still defaults missing ownership to chat', () => {
  const baseState = createDefaultChatState();

  const codeState = createParallelChatGroup(baseState, {
    title: 'Code fanout',
    originSurface: 'code',
    targets: [
      { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
      { provider: 'codex', instance: null, model: 'gpt-5.4' },
    ],
  });
  assert.equal(codeState.parallelChatGroups[0]?.originSurface, 'code');
  assert.deepEqual(
    codeState.channels.slice(0, 2).map((channel) => channel.originSurface),
    ['code', 'code'],
  );

  const defaultedState = createParallelChatGroup(baseState, {
    title: 'Legacy fanout',
    targets: [
      { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
      { provider: 'codex', instance: null, model: 'gpt-5.4' },
    ],
  });
  assert.equal(defaultedState.parallelChatGroups[0]?.originSurface, 'chat');
  assert.deepEqual(
    defaultedState.channels.slice(0, 2).map((channel) => channel.originSurface),
    ['chat', 'chat'],
  );
});

test('state-model create helpers reject invalid originSurface values', () => {
  const baseState = createDefaultChatState();

  assert.throws(
    () => createChannel(baseState, {
      title: 'Invalid room',
      topic: 'Should reject invalid origin surfaces.',
      originSurface: 'bogus',
      skipBossCatGreeting: true,
    }),
    /originSurface must be one of: chat, work, code\./u,
  );

  assert.throws(
    () => createParallelChatGroup(baseState, {
      title: 'Invalid fanout',
      originSurface: 'bogus',
      targets: [
        { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
        { provider: 'codex', instance: null, model: 'gpt-5.4' },
      ],
    }),
    /originSurface must be one of: chat, work, code\./u,
  );
});
