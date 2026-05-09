import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultCoreState,
  upsertCoreConversation,
  upsertCoreMission,
  upsertCoreRun,
  upsertCoreTransportBinding,
} from '../src/core/model/index.js';
import {
  buildCoreLinkageDiagnostics,
  isCoreLinkageHealthy,
} from '../src/core/linkageDiagnostics.js';

test('buildCoreLinkageDiagnostics reports a healthy core when nothing is broken', () => {
  const report = buildCoreLinkageDiagnostics(createDefaultCoreState());
  assert.equal(report.summary.totalDiagnosticCount, 0);
  assert.equal(report.summary.missionDiagnosticCount, 0);
  assert.equal(report.summary.runDiagnosticCount, 0);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
  assert.deepEqual(report.missions, []);
  assert.deepEqual(report.runs, []);
  assert.deepEqual(report.transportBindings, []);
  assert.equal(isCoreLinkageHealthy(report), true);
});

test('buildCoreLinkageDiagnostics aggregates mission / run / transport binding issues', () => {
  let core = createDefaultCoreState();
  // Mission with broken managed work anchor.
  core = upsertCoreMission(
    core,
    {
      id: 'mission-broken',
      title: 'Broken mission',
      managedWorkId: 'work-item-missing',
      status: 'planned',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  // Run with broken task anchor.
  core = upsertCoreRun(
    core,
    {
      id: 'run-broken',
      title: 'Broken run',
      taskId: 'task-missing',
      status: 'queued',
      orchestratorActorId: null,
    },
    new Date('2026-04-14T22:01:00.000Z'),
  ).core;
  // Direct-lane projection binding pointing at a non-existent
  // conversation. Real direct-lane bindings always carry
  // `metadata.channelKind === "direct_message"` (stamped by
  // `createDirectLaneTransportBindings`).
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-stale',
      platform: 'internal',
      direction: 'bidirectional',
      conversationId: 'conversation-deleted',
      status: 'active',
      metadata: { channelId: 'channel-stale', channelKind: 'direct_message' },
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  // Healthy direct-lane projection binding linked to a real direct
  // conversation.
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-direct-1',
      title: 'Direct chat',
      kind: 'direct_message',
    },
    new Date('2026-04-14T22:03:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-healthy',
      platform: 'internal',
      direction: 'bidirectional',
      conversationId: 'conversation-direct-1',
      status: 'active',
      metadata: { channelId: 'channel-healthy', channelKind: 'direct_message' },
    },
    new Date('2026-04-14T22:04:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(isCoreLinkageHealthy(report), false);
  assert.equal(report.summary.missionDiagnosticCount, 1);
  assert.equal(report.summary.runDiagnosticCount, 1);
  assert.equal(report.summary.transportBindingDiagnosticCount, 1);
  assert.equal(report.summary.totalDiagnosticCount, 3);
  assert.equal(report.missions[0]?.missionId, 'mission-broken');
  assert.equal(report.missions[0]?.anchor, 'managed_work');
  assert.equal(report.runs[0]?.runId, 'run-broken');
  assert.equal(report.runs[0]?.anchor, 'task');
  assert.equal(report.transportBindings[0]?.transportBindingId, 'binding-stale');
  assert.equal(report.transportBindings[0]?.status, 'no_conversation_linked');
});

test('buildCoreLinkageDiagnostics treats disabled / archived bindings as healthy operator state', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-direct-1',
      title: 'Direct chat',
      kind: 'direct_message',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-disabled',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-direct-1',
      status: 'disabled',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-archived',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-direct-1',
      status: 'archived',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
});

test('buildCoreLinkageDiagnostics ignores non-inbound bindings (no direct-lane ingress to validate)', () => {
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-bidirectional',
      platform: 'internal',
      direction: 'bidirectional',
      conversationId: null,
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
  assert.equal(isCoreLinkageHealthy(report), true);
});

test('buildCoreLinkageDiagnostics flags a bidirectional direct-lane binding pointing at a deleted conversation', () => {
  let core = createDefaultCoreState();
  // Mirrors createDirectLaneTransportBindings: platform internal,
  // direction bidirectional, conversationId set.
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-direct-lane',
      platform: 'internal',
      direction: 'bidirectional',
      conversationId: 'conversation-deleted',
      status: 'active',
      metadata: { channelId: 'channel-1', channelKind: 'direct_message' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 1);
  assert.equal(report.transportBindings[0]?.transportBindingId, 'binding-direct-lane');
  assert.equal(report.transportBindings[0]?.status, 'no_conversation_linked');
});

test('buildCoreLinkageDiagnostics ignores telegram bot bindings (bidirectional, conversationId null)', () => {
  let core = createDefaultCoreState();
  // Mirrors createBotTransportBindings: direction bidirectional,
  // conversationId null, telegram platform.
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-bot',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: null,
      status: 'active',
      metadata: { bindingId: 'bot-binding-1', botName: 'cats_bot' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
  assert.equal(isCoreLinkageHealthy(report), true);
});

test('buildCoreLinkageDiagnostics does not flag bot bindings even if they happen to carry a conversationId', () => {
  // Defensive: even if a bot binding ever ends up with a non-null
  // conversationId (e.g. via metadata copy-paste), the absence of
  // metadata.channelKind === "direct_message" must keep it out of
  // direct-lane scope.
  let core = createDefaultCoreState();
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-bot-with-conversation',
      platform: 'telegram',
      direction: 'bidirectional',
      conversationId: 'conversation-deleted',
      status: 'active',
      metadata: {
        bindingId: 'bot-binding-2',
        botName: 'cats_bot',
        inboundMode: 'webhook',
      },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
});

test('buildCoreLinkageDiagnostics flags a direct-lane binding pointing at the wrong conversation kind', () => {
  let core = createDefaultCoreState();
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-channel-1',
      title: 'Group channel',
      kind: 'chat_channel',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-misrouted',
      platform: 'internal',
      direction: 'bidirectional',
      conversationId: 'conversation-channel-1',
      status: 'active',
      metadata: { channelId: 'channel-misrouted', channelKind: 'direct_message' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 1);
  assert.equal(report.transportBindings[0]?.status, 'conversation_not_direct_lane');
});

test('buildCoreLinkageDiagnostics does not flag inbound bindings without direct-lane metadata', () => {
  // Regression for the dropped `direction === "inbound"` fallback.
  // A future Telegram bot ingress binding pointing at a chat_channel
  // is not a direct-lane projection; the direct-lane resolver would
  // mis-flag `conversation_not_direct_lane` if we still let inbound
  // bindings into scope without the explicit metadata signal.
  let core = createDefaultCoreState();
  core = upsertCoreConversation(
    core,
    {
      id: 'conversation-channel-1',
      title: 'Group channel',
      kind: 'chat_channel',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-inbound-no-metadata',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-channel-1',
      status: 'active',
      metadata: { bindingId: 'bot-binding-future', botName: 'group_bot' },
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 0);
  assert.equal(isCoreLinkageHealthy(report), true);
});
