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
  // Inbound transport binding pointing at a non-existent conversation.
  core = upsertCoreTransportBinding(
    core,
    {
      id: 'binding-stale',
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-deleted',
      status: 'active',
    },
    new Date('2026-04-14T22:02:00.000Z'),
  ).core;
  // Healthy transport binding linked to a real direct conversation.
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
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-direct-1',
      status: 'active',
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

test('buildCoreLinkageDiagnostics flags an inbound binding pointing at the wrong conversation kind', () => {
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
      platform: 'telegram',
      direction: 'inbound',
      conversationId: 'conversation-channel-1',
      status: 'active',
    },
    new Date('2026-04-14T22:00:00.000Z'),
  ).core;

  const report = buildCoreLinkageDiagnostics(core);
  assert.equal(report.summary.transportBindingDiagnosticCount, 1);
  assert.equal(report.transportBindings[0]?.status, 'conversation_not_direct_lane');
});
