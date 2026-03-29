import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyContinuityTopology,
  resolveContinuityRule,
  shouldFlushMemory,
} from '../dist-server/products/chat/state/session-continuity/rules.js';

test('classifyContinuityTopology returns solo_thread for boss_thread kind', () => {
  const topology = classifyContinuityTopology({ channelKind: 'boss_thread', topic: '' });
  assert.equal(topology, 'solo_thread');
});

test('classifyContinuityTopology returns boss_led_room for multi_cat_room kind', () => {
  const topology = classifyContinuityTopology({ channelKind: 'multi_cat_room', topic: '' });
  assert.equal(topology, 'boss_led_room');
});

test('classifyContinuityTopology returns direct_lane for direct_lane kind', () => {
  const topology = classifyContinuityTopology({ channelKind: 'direct_lane', topic: 'General chat' });
  assert.equal(topology, 'direct_lane');
});

test('classifyContinuityTopology returns telegram_private_lane when topic mentions telegram', () => {
  const topology = classifyContinuityTopology({ channelKind: 'direct_lane', topic: 'Telegram private lane' });
  assert.equal(topology, 'telegram_private_lane');
});

test('classifyContinuityTopology defaults to solo_thread for unknown kind', () => {
  const topology = classifyContinuityTopology({ channelKind: undefined, topic: '' });
  assert.equal(topology, 'solo_thread');
});

test('resolveContinuityRule for solo_thread has manual reset and no idle timeout', () => {
  const rule = resolveContinuityRule('solo_thread');
  assert.equal(rule.resetBehavior, 'manual');
  assert.equal(rule.idleTimeoutMs, null);
  assert.equal(rule.allowSleep, false);
  assert.equal(rule.allowResume, false);
});

test('resolveContinuityRule for direct_lane has 30min idle timeout and allows sleep', () => {
  const rule = resolveContinuityRule('direct_lane');
  assert.equal(rule.resetBehavior, 'on_idle_timeout');
  assert.equal(rule.idleTimeoutMs, 30 * 60 * 1000);
  assert.equal(rule.allowSleep, true);
  assert.equal(rule.allowResume, true);
});

test('resolveContinuityRule for telegram_private_lane has 15min idle timeout', () => {
  const rule = resolveContinuityRule('telegram_private_lane');
  assert.equal(rule.idleTimeoutMs, 15 * 60 * 1000);
  assert.equal(rule.allowSleep, true);
});

test('resolveContinuityRule for boss_led_room has before_reset compaction', () => {
  const rule = resolveContinuityRule('boss_led_room');
  assert.equal(rule.compactionPolicy, 'before_reset');
  assert.equal(rule.memoryFlushPhase, 'pre_reset');
  assert.equal(rule.allowResume, true);
});

test('shouldFlushMemory returns true for pre_reset phase on reset', () => {
  const rule = resolveContinuityRule('direct_lane');
  assert.equal(shouldFlushMemory(rule, 'reset'), true);
});

test('shouldFlushMemory returns false for solo_thread on reset', () => {
  const rule = resolveContinuityRule('solo_thread');
  assert.equal(shouldFlushMemory(rule, 'reset'), false);
});
