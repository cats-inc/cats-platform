import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCatStatusIndicator } from '../build/server/products/chat/shared/catStatusResolution.js';
import { messageKeys } from '../build/server/shared/i18n/index.js';

function buildCat(id = 'cat-1', name = 'TestCat') {
  return { id, name, avatarColor: '#abc', status: 'active', roles: [], createdAt: '', updatedAt: '' };
}

function buildChannel(leaseStatus = 'ready') {
  return {
    id: 'ch-1',
    title: 'Test',
    topic: '',
    status: 'active',
    channelKind: 'direct_message',
    catAssignments: [
      {
        catId: 'cat-1',
        assignedAt: '',
        execution: {
          target: { provider: 'claude', instance: null, model: null },
          lease: { sessionId: null, status: leaseStatus, cwd: null, lastError: null, provider: null, model: null, startedAt: null, lastUsedAt: null },
        },
      },
    ],
    messages: [],
    createdAt: '',
    updatedAt: '',
    lastMessageAt: null,
    lastActivatedAt: null,
    orchestratorLease: { sessionId: null, status: 'not_started', cwd: null, lastError: null, provider: null, model: null, startedAt: null, lastUsedAt: null },
  };
}

test('resolves active status when lease is ready', () => {
  const indicator = resolveCatStatusIndicator(buildCat(), buildChannel('ready'), null);
  assert.equal(indicator.status, 'active');
  assert.equal(indicator.busy, true);
});

test('resolves sleeping status when lease is not_started', () => {
  const indicator = resolveCatStatusIndicator(buildCat(), buildChannel('not_started'), null);
  assert.equal(indicator.status, 'sleeping');
  assert.equal(indicator.busy, false);
});

test('resolves error status when lease is error', () => {
  const indicator = resolveCatStatusIndicator(buildCat(), buildChannel('error'), null);
  assert.equal(indicator.status, 'error');
});

test('resolves waking status when lease is initializing', () => {
  const indicator = resolveCatStatusIndicator(buildCat(), buildChannel('initializing'), null);
  assert.equal(indicator.status, 'active');
  assert.equal(indicator.statusLabelKey, messageKeys.chatCatStatusWakingUpLabel);
  assert.equal(indicator.busy, true);
});

test('resolves waiting_for_review when approvals pending', () => {
  const operatorView = {
    channelId: 'ch-1',
    conversationId: '',
    actorNameById: {},
    task: null,
    approvals: [{ status: 'pending', id: 'a-1' }],
    runs: [],
    traces: [],
    checkpoints: [],
    outcomes: [],
    activityFeed: [],
    latestRun: null,
    latestOutcome: null,
    latestCheckpoint: null,
    latestApproval: null,
    guardReason: null,
    cooldownLabel: null,
    effectivePolicy: null,
    governanceSummary: null,
    workflowSummary: null,
    latestWorkflowRecommendation: null,
    approvalActions: [],
    incidentActions: [],
  };
  const indicator = resolveCatStatusIndicator(buildCat(), buildChannel('ready'), operatorView);
  assert.equal(indicator.status, 'waiting_for_review');
});

test('includes cat name and avatar color', () => {
  const indicator = resolveCatStatusIndicator(
    buildCat('cat-1', 'MyCat'),
    buildChannel('ready'),
    null,
  );
  assert.equal(indicator.catName, 'MyCat');
  assert.equal(indicator.avatarColor, '#abc');
});
