import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreSession,
  upsertCoreTransportBinding,
} from '../src/core/model/index.js';
import {
  TRANSPORT_BINDING_METADATA_BOT_BINDING_KEY,
  buildAllTransportBindingObservabilitySnapshots,
  buildTransportBindingObservabilitySnapshot,
  findSessionsForTransportBinding,
} from '../src/core/transportBindingObservability.js';

function seedConversation(
  coreInput: ReturnType<typeof createDefaultCoreState>,
  id: string,
): ReturnType<typeof createDefaultCoreState> {
  return upsertCoreConversation(
    coreInput,
    {
      id,
      title: id,
      kind: 'direct_message',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
}

test('buildTransportBindingObservabilitySnapshot returns null for unknown bindings', () => {
  const core = createDefaultCoreState();
  assert.equal(
    buildTransportBindingObservabilitySnapshot(core, 'binding-missing'),
    null,
  );
});

test('buildTransportBindingObservabilitySnapshot consolidates binding fields and sessions', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-telegram-1');
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-telegram-1',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-telegram-1',
      externalThreadKey: 'tg:chat:42',
      status: 'active',
      metadata: { [TRANSPORT_BINDING_METADATA_BOT_BINDING_KEY]: 'bot-binding-将将' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-1',
      conversationId: 'conversation-telegram-1',
      transportBindingId: 'binding-telegram-1',
      runtimeKey: 'runtime-1',
      status: 'active',
      startedAt: '2026-04-14T22:01:00.000Z',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-2',
      conversationId: 'conversation-telegram-1',
      transportBindingId: 'binding-telegram-1',
      runtimeKey: 'runtime-2',
      status: 'completed',
      startedAt: '2026-04-14T22:00:30.000Z',
      completedAt: '2026-04-14T22:00:45.000Z',
    },
    new Date('2026-04-14T22:00:45.000Z'),
  ).core;

  const snapshot = buildTransportBindingObservabilitySnapshot(core, 'binding-telegram-1');

  assert.ok(snapshot);
  assert.equal(snapshot?.transportBindingId, 'binding-telegram-1');
  assert.equal(snapshot?.platform, 'telegram');
  assert.equal(snapshot?.direction, 'inbound');
  assert.equal(snapshot?.conversationId, 'conversation-telegram-1');
  assert.equal(snapshot?.externalThreadKey, 'tg:chat:42');
  assert.equal(snapshot?.botBindingIdHint, 'bot-binding-将将');
  assert.equal(snapshot?.sessions.length, 2);
  // Sessions are ordered most-recently-updated first.
  assert.equal(snapshot?.sessions[0]?.sessionId, 'session-1');
  assert.equal(snapshot?.sessions[0]?.runtimeKey, 'runtime-1');
  assert.equal(snapshot?.sessions[1]?.sessionId, 'session-2');
  // Runtime keys remain on the session snapshot, separate from the
  // transport binding's own identity fields.
  assert.equal(snapshot?.sessions[1]?.runtimeKey, 'runtime-2');
});

test('buildTransportBindingObservabilitySnapshot returns no sessions when none reference the binding', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-internal-1',
      platform: 'internal',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const snapshot = buildTransportBindingObservabilitySnapshot(core, 'binding-internal-1');

  assert.ok(snapshot);
  assert.equal(snapshot?.sessions.length, 0);
  assert.equal(snapshot?.botBindingIdHint, null);
});

test('findSessionsForTransportBinding only returns matching sessions', () => {
  let core = createDefaultCoreState();
  core = seedConversation(core, 'conversation-1');
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-a',
      platform: 'telegram',
      conversationId: 'conversation-1',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-b',
      platform: 'telegram',
      conversationId: 'conversation-1',
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-a',
      conversationId: 'conversation-1',
      transportBindingId: 'binding-a',
      status: 'active',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-b',
      conversationId: 'conversation-1',
      transportBindingId: 'binding-b',
      status: 'active',
    },
    new Date('2026-04-14T22:02:30.000Z'),
  ).core;
  core = upsertCoreSession(
    core,
    {
      id: 'session-orphan',
      conversationId: 'conversation-1',
      transportBindingId: null,
      status: 'active',
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;

  const aSessions = findSessionsForTransportBinding(core, 'binding-a');
  assert.equal(aSessions.length, 1);
  assert.equal(aSessions[0]?.id, 'session-a');

  const bSessions = findSessionsForTransportBinding(core, 'binding-b');
  assert.equal(bSessions.length, 1);
  assert.equal(bSessions[0]?.id, 'session-b');
});

test('buildAllTransportBindingObservabilitySnapshots covers every binding', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    { id: 'binding-1', platform: 'telegram' },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    { id: 'binding-2', platform: 'line' },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;

  const snapshots = buildAllTransportBindingObservabilitySnapshots(core);
  assert.equal(snapshots.length, 2);
  const ids = snapshots.map((snapshot) => snapshot.transportBindingId).sort();
  assert.deepEqual(ids, ['binding-1', 'binding-2']);
});
