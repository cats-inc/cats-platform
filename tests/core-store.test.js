import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryCoreStore } from '../dist-server/core/store.js';
import { buildApprovalQueue, createDefaultCoreState } from '../dist-server/core/model.js';

test('MemoryCoreStore exposes a neutral read/write boundary for Cats Core state', async () => {
  const initialState = createDefaultCoreState();
  const store = new MemoryCoreStore(initialState);

  const firstRead = await store.readCore();
  assert.deepEqual(firstRead, initialState);
  assert.notStrictEqual(firstRead, initialState);

  const nextState = structuredClone(firstRead);
  nextState.setupCompleteAt = '2026-03-21T00:00:00.000Z';
  nextState.ownerProfile.displayName = 'Suite Owner';

  const written = await store.writeCore(nextState);
  const secondRead = await store.readCore();

  assert.equal(written.setupCompleteAt, '2026-03-21T00:00:00.000Z');
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');

  nextState.ownerProfile.displayName = 'Mutated after write';
  assert.equal(secondRead.ownerProfile.displayName, 'Suite Owner');
});

test('buildApprovalQueue only surfaces tasks that are actually pending approval', () => {
  const core = createDefaultCoreState();
  core.tasks.push(
    {
      id: 'task-draft',
      title: 'Draft task',
      status: 'draft',
      conversationId: null,
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator-global',
      assignedActorIds: [],
      summary: null,
      approval: {
        status: 'not_requested',
        requestedAt: null,
        decidedAt: null,
        decidedByActorId: null,
        notes: null,
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    },
    {
      id: 'task-pending',
      title: 'Pending approval task',
      status: 'pending_approval',
      conversationId: 'conversation-1',
      ownerActorId: 'actor-owner',
      orchestratorActorId: 'actor-orchestrator-global',
      assignedActorIds: ['actor-pal-1'],
      summary: 'Needs owner decision',
      approval: {
        status: 'pending',
        requestedAt: '2026-03-21T00:01:00.000Z',
        decidedAt: null,
        decidedByActorId: null,
        notes: 'Approve before dispatch',
      },
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:01:00.000Z',
    },
  );

  const approvals = buildApprovalQueue(core);

  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].taskId, 'task-pending');
  assert.equal(approvals[0].status, 'pending');
  assert.equal(approvals[0].requiresOwnerDecision, true);
});
