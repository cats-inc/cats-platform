import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import {
  createChannel,
  createParallelChatGroup,
} from '../build/server/products/chat/state/model/index.js';

test('state-model channel create preserves explicit originSurface and rejects missing ownership', () => {
  const baseState = createDefaultChatState();

  const workState = createChannel(baseState, {
    title: 'Work owned room',
    topic: 'Typed product-owned create should keep work ownership.',
    originSurface: 'work',
    skipBossCatGreeting: true,
  });
  assert.equal(workState.channels[0]?.originSurface, 'work');

  assert.throws(
    () => createChannel(baseState, {
      title: 'Missing owner room',
      topic: 'Model helper should reject missing originSurface.',
      skipBossCatGreeting: true,
    }),
    /originSurface is required\./u,
  );
});

test('state-model parallel create preserves explicit originSurface and rejects missing ownership', () => {
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

  assert.throws(
    () => createParallelChatGroup(baseState, {
      title: 'Missing owner fanout',
      targets: [
        { provider: 'claude', instance: null, model: 'claude-opus-4-6' },
        { provider: 'codex', instance: null, model: 'gpt-5.4' },
      ],
    }),
    /originSurface is required\./u,
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
