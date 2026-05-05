import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyContinuityTopology,
  resolveContinuityRule,
  shouldFlushMemory,
} from '../build/server/products/chat/state/session-continuity/rules.js';

test('classifyContinuityTopology returns default_chat for chat_channel kind', () => {
  const topology = classifyContinuityTopology({ channelKind: 'chat_channel', topic: '' });
  assert.equal(topology, 'default_chat');
});

test('classifyContinuityTopology returns participant_chat for chat_channel kind', () => {
  const topology = classifyContinuityTopology({
    channelKind: 'chat_channel',
    topic: '',
    assignedParticipants: [{ participantId: 'cat-1', status: 'active' }],
  });
  assert.equal(topology, 'participant_chat');
});

test('classifyContinuityTopology returns direct_message for direct_message kind', () => {
  const topology = classifyContinuityTopology({ channelKind: 'direct_message', topic: 'General chat' });
  assert.equal(topology, 'direct_message');
});

test('classifyContinuityTopology returns telegram_direct_message when topic mentions telegram', () => {
  const topology = classifyContinuityTopology({ channelKind: 'direct_message', topic: 'Telegram direct message' });
  assert.equal(topology, 'telegram_direct_message');
});

test('classifyContinuityTopology defaults to default_chat for unknown kind', () => {
  const topology = classifyContinuityTopology({ channelKind: undefined, topic: '' });
  assert.equal(topology, 'default_chat');
});

test('resolveContinuityRule for default_chat has manual reset and no idle timeout', () => {
  const rule = resolveContinuityRule('default_chat');
  assert.equal(rule.resetBehavior, 'manual');
  assert.equal(rule.idleTimeoutMs, null);
  assert.equal(rule.allowSleep, false);
  assert.equal(rule.allowResume, false);
});

test('resolveContinuityRule for direct_message has 30min idle timeout and allows sleep', () => {
  const rule = resolveContinuityRule('direct_message');
  assert.equal(rule.resetBehavior, 'on_idle_timeout');
  assert.equal(rule.idleTimeoutMs, 30 * 60 * 1000);
  assert.equal(rule.allowSleep, true);
  assert.equal(rule.allowResume, true);
});

test('resolveContinuityRule for telegram_direct_message has 15min idle timeout', () => {
  const rule = resolveContinuityRule('telegram_direct_message');
  assert.equal(rule.idleTimeoutMs, 15 * 60 * 1000);
  assert.equal(rule.allowSleep, true);
});

test('resolveContinuityRule for participant_chat has before_reset compaction', () => {
  const rule = resolveContinuityRule('participant_chat');
  assert.equal(rule.compactionPolicy, 'before_reset');
  assert.equal(rule.memoryFlushPhase, 'pre_reset');
  assert.equal(rule.allowResume, true);
});

test('shouldFlushMemory returns true for pre_reset phase on reset', () => {
  const rule = resolveContinuityRule('direct_message');
  assert.equal(shouldFlushMemory(rule, 'reset'), true);
});

test('shouldFlushMemory returns false for default_chat on reset', () => {
  const rule = resolveContinuityRule('default_chat');
  assert.equal(shouldFlushMemory(rule, 'reset'), false);
});
