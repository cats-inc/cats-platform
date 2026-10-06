import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeChannel } from '../src/products/chat/state/chat-snapshot/entities.ts';
import { normalizeExecutionLease, normalizeExecutionState } from '../src/products/chat/state/chat-snapshot/shared.ts';

test('normalizeChannel back-fills legacy repo-backed runtime policy defaults', () => {
  const channel = normalizeChannel(
    {
      id: 'channel-legacy',
      title: 'Legacy repo room',
      topic: 'Loaded from an older snapshot without runtime policy fields.',
      repoPath: 'C:/repo/cats-platform',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
      messages: [],
    },
    new Map(),
  );

  assert.ok(channel);
  assert.equal(channel.runtimeWorkspaceKind, 'source');
  assert.equal(channel.runtimeWorkspaceAccess, 'read_write');
  assert.equal(channel.runtimePermissionMode, 'skip');
});

test('snapshot normalization preserves selections on orchestrator and participant leases without sharing control objects', () => {
  const selection = { entryMode: 'explicit', entryId: 'opus', catalogRevision: 'R1', presetId: 'careful',
    controls: { 'claude.reasoning_effort': 'medium' } };
  const target = { provider: 'claude', instance: 'cli/native', model: 'opus' };
  const raw = { sessionId: 'session-1', status: 'ready', cwd: 'C:/workspace/timer', ...target, modelSelection: selection };
  const lease = normalizeExecutionLease(raw, target);
  const execution = normalizeExecutionState({ target, lease: raw, modelSelection: selection }, target);
  assert.deepEqual(lease.modelSelection, selection);
  assert.deepEqual(execution.lease.modelSelection, selection);
  assert.deepEqual(execution.modelSelection, selection);
  selection.controls['claude.reasoning_effort'] = 'high';
  assert.equal(lease.modelSelection?.controls?.['claude.reasoning_effort'], 'medium');
  assert.equal(normalizeExecutionLease({ modelSelection: null }, target).modelSelection, null);
  assert.equal(normalizeExecutionLease({}, target).modelSelection, undefined);
});
