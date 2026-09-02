/**
 * The real permission envelope (SPEC-114 FR-4, PLAN-105 gate G1).
 *
 * This replaced a placeholder that treated "a workspace path is set" as the
 * whole permission model. Two properties are worth pinning, and the second is
 * the one that was actually unsafe:
 *
 *  - the configured path is checked against what the runtime observes, not
 *    against an operator's claim about it; and
 *  - the provider is never granted `broad_write`, because that scope covers
 *    externally-visible and destructive tools and would let a run push or deploy
 *    through its own tools while Cats still believed publication was waiting on
 *    an owner approval.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateTransportWorkReadiness } from '../src/platform/transports/work-delivery/readiness.js';
import {
  resolveTransportWorkPermissionEnvelope,
  TRANSPORT_WORK_PERMISSION_REASONS,
} from '../src/platform/transports/work-delivery/permissionEnvelope.js';
import type { CoreDeliveryMode } from '../src/core/types.js';

const REPO = { reachable: true, repository: true };
const PLAIN_DIRECTORY = { reachable: true, repository: false };

// --- The scope ceiling ---------------------------------------------------------

test('no delivery mode ever grants the provider broad_write', () => {
  const modes: CoreDeliveryMode[] = [
    'artifact_only',
    'commit_only',
    'push_branch',
    'pr_with_checks',
    'deploy_preview',
  ];
  for (const deliveryMode of modes) {
    const envelope = resolveTransportWorkPermissionEnvelope({
      workspacePath: '/repos/cats',
      workspace: REPO,
      deliveryMode,
    });
    assert.notEqual(
      envelope.toolScope,
      'broad_write',
      `${deliveryMode} must not hand the provider externally-visible tools; `
      + 'external effects run through the gated delivery API instead',
    );
  }
});

test('a usable repo workspace grants exactly narrow_write', () => {
  const envelope = resolveTransportWorkPermissionEnvelope({
    workspacePath: '/repos/cats',
    workspace: REPO,
    deliveryMode: 'commit_only',
  });
  assert.deepEqual(envelope, { toolScope: 'narrow_write', sufficient: true, reasons: [] });
});

// --- Observed, not claimed -----------------------------------------------------

test('an unconfigured workspace grants nothing', () => {
  const envelope = resolveTransportWorkPermissionEnvelope({
    workspacePath: null,
    workspace: null,
    deliveryMode: 'commit_only',
  });
  assert.equal(envelope.toolScope, 'none');
  assert.deepEqual(envelope.reasons, ['workspace_not_configured']);
});

test('a workspace the runtime cannot inspect grants nothing', () => {
  // The runtime being unreachable, or the path not existing, both arrive here as
  // "no observation". Assuming the optimistic case would hand out write tools
  // for a directory nobody has confirmed exists.
  for (const workspace of [null, { reachable: false, repository: false }]) {
    const envelope = resolveTransportWorkPermissionEnvelope({
      workspacePath: '/repos/typo',
      workspace,
      deliveryMode: 'commit_only',
    });
    assert.equal(envelope.toolScope, 'none');
    assert.deepEqual(envelope.reasons, ['workspace_unreachable']);
  }
});

test('a commit-backed mode against a plain directory is refused before the run starts', () => {
  const envelope = resolveTransportWorkPermissionEnvelope({
    workspacePath: '/tmp/notes',
    workspace: PLAIN_DIRECTORY,
    deliveryMode: 'commit_only',
  });
  assert.equal(envelope.sufficient, false);
  assert.deepEqual(envelope.reasons, ['workspace_not_a_repository']);
  assert.equal(
    envelope.toolScope,
    'read_only',
    'it can still be inspected; it just cannot produce the commit this mode requires',
  );
});

test('artifact_only does not need a repository', () => {
  const envelope = resolveTransportWorkPermissionEnvelope({
    workspacePath: '/tmp/notes',
    workspace: PLAIN_DIRECTORY,
    deliveryMode: 'artifact_only',
  });
  assert.deepEqual(envelope, { toolScope: 'narrow_write', sufficient: true, reasons: [] });
});

// --- Reaching the owner --------------------------------------------------------

test('every permission reason becomes its own readiness blocker', () => {
  // Collapsing these into one "permissions" code is what made the old surface
  // unactionable: the owner could not tell which prerequisite was missing.
  const seen = new Set<string>();
  const cases = [
    { workspacePath: null, workspace: null, deliveryMode: 'commit_only' as const },
    { workspacePath: '/x', workspace: null, deliveryMode: 'commit_only' as const },
    {
      workspacePath: '/x',
      workspace: PLAIN_DIRECTORY,
      deliveryMode: 'commit_only' as const,
    },
  ];

  for (const input of cases) {
    const permission = resolveTransportWorkPermissionEnvelope(input);
    for (const reason of permission.reasons) {
      seen.add(reason);
    }
    const readiness = evaluateTransportWorkReadiness({
      bindingEnabled: true,
      bindingHealthy: true,
      ownerAuthorized: true,
      boundCatId: 'cat-1',
      executionTargetId: 'claude:opus',
      capabilityProfileResolved: true,
      workspacePath: input.workspacePath,
      permission,
      deliveryMode: input.deliveryMode,
      deliveryGates: [],
      backgroundServiceAvailable: true,
    });
    assert.equal(readiness.ready, false);
    assert.equal(
      readiness.blockers.length,
      permission.reasons.length,
      'one blocker per permission reason, not a single generic one',
    );
    for (const blocker of readiness.blockers) {
      assert.ok(blocker.remediationKey.startsWith('workDelivery.readiness.'));
      assert.ok(blocker.remediationPath, 'a blocker without a fix path is not actionable');
    }
  }

  assert.deepEqual(
    [...seen].sort(),
    [...TRANSPORT_WORK_PERMISSION_REASONS].sort(),
    'every declared reason is reachable',
  );
});
