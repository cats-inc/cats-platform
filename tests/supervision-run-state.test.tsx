import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyApprovalDenied,
  applyOperatorCancellation,
  canFallbackContinueWithoutDeniedAction,
  deriveRunState,
} from '../src/platform/supervision/index.ts';

test('pending approval wins primary state while retaining non-approval blockers', () => {
  const evaluation = deriveRunState({
    lifecycle: 'active',
    blockers: [
      {
        code: 'BUDGET_SOFT_LIMIT',
        message: 'Budget is near limit.',
      },
    ],
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
  });

  assert.equal(evaluation.primaryState, 'waiting_for_approval');
  assert.deepEqual(evaluation.blockers.map((blocker) => blocker.code), ['BUDGET_SOFT_LIMIT']);
});

test('non-approval blockers produce blocked primary state', () => {
  const evaluation = deriveRunState({
    lifecycle: 'active',
    blockers: [
      {
        code: 'TOOL_UNAVAILABLE',
        message: 'Tool registry unavailable.',
      },
    ],
  });

  assert.equal(evaluation.primaryState, 'blocked');
});

test('queued and active runs derive queued or running when no blockers exist', () => {
  assert.equal(deriveRunState({ lifecycle: 'queued' }).primaryState, 'queued');
  assert.equal(deriveRunState({ lifecycle: 'active' }).primaryState, 'running');
});

test('terminal states override waiting and blocked states', () => {
  const evaluation = deriveRunState({
    lifecycle: 'cancelled',
    blockers: [
      {
        code: 'BUDGET_HARD_STOP',
        message: 'Budget exhausted.',
      },
    ],
    approvalRequests: [
      {
        requestId: 'approval-1',
        state: 'pending',
        gating: true,
      },
    ],
    terminalCause: 'operator cancelled',
  });

  assert.equal(evaluation.primaryState, 'cancelled');
  assert.equal(evaluation.terminalCause, 'operator cancelled');
});

test('approval denial can re-evaluate to running when fallback can continue', () => {
  const evaluation = applyApprovalDenied({
    current: {
      lifecycle: 'active',
      approvalRequests: [
        {
          requestId: 'approval-1',
          state: 'pending',
          gating: true,
        },
      ],
    },
    requestId: 'approval-1',
    fallbackPolicy: 'delegate_other',
  });

  assert.equal(evaluation.primaryState, 'running');
  assert.equal(evaluation.approvalRequests[0]?.state, 'denied');
});

test('approval denial fails the run when fallback cannot continue', () => {
  const evaluation = applyApprovalDenied({
    current: {
      lifecycle: 'active',
      approvalRequests: [
        {
          requestId: 'approval-1',
          state: 'pending',
          gating: true,
        },
      ],
    },
    requestId: 'approval-1',
    fallbackPolicy: 'ask_human',
  });

  assert.equal(evaluation.primaryState, 'failed');
  assert.equal(evaluation.terminalCause, 'approval denied: approval-1');
});

test('operator cancellation marks pending approvals cancelled and records audit reason', () => {
  const evaluation = applyOperatorCancellation({
    current: {
      lifecycle: 'active',
      approvalRequests: [
        {
          requestId: 'approval-1',
          state: 'pending',
          gating: true,
        },
        {
          requestId: 'approval-2',
          state: 'approved',
          gating: false,
        },
      ],
    },
    requestedAt: '2026-04-25T06:00:00.000Z',
    requestedBy: 'operator:owner',
    reasonCode: 'operator_decision',
    reasonNote: 'No longer needed.',
  });

  assert.equal(evaluation.primaryState, 'cancelled');
  assert.deepEqual(evaluation.approvalRequests.map((approval) => approval.state), [
    'cancelled',
    'approved',
  ]);
  assert.equal(evaluation.cancelAudit.reasonCode, 'operator_decision');
  assert.equal(evaluation.cancelAudit.reasonNote, 'No longer needed.');
});

test('fallback continuation policy is explicit', () => {
  assert.equal(canFallbackContinueWithoutDeniedAction('retry'), true);
  assert.equal(canFallbackContinueWithoutDeniedAction('escalate_model'), true);
  assert.equal(canFallbackContinueWithoutDeniedAction('delegate_other'), true);
  assert.equal(canFallbackContinueWithoutDeniedAction('ask_human'), false);
});
