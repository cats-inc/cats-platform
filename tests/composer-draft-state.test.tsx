import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultRuntimeSessionPolicy } from '../src/shared/runtimeSessionPolicy.ts';
import { resetComposerDraftState } from '../src/products/shared/renderer/composerDraftState.ts';

test('resetComposerDraftState clears every managed draft surface back to defaults', () => {
  const calls: Array<{ key: string; value: unknown }> = [];
  let resetParallelCalls = 0;

  resetComposerDraftState({
    setDraftCwd: (value) => {
      calls.push({ key: 'cwd', value });
      return value;
    },
    setDraftCatIds: (value) => {
      calls.push({ key: 'catIds', value });
      return value;
    },
    setDraftTemporaryParticipants: (value) => {
      calls.push({ key: 'temporaryParticipants', value });
      return value;
    },
    setDraftHighlightedCatId: (value) => {
      calls.push({ key: 'highlightedCatId', value });
      return value;
    },
    setDraftCatExecutionTargetOverrides: (value) => {
      calls.push({ key: 'executionOverrides', value });
      return value;
    },
    setDraftRuntimeSessionPolicy: (value) => {
      calls.push({ key: 'runtimeSessionPolicy', value });
      return value;
    },
    setDraftFiles: (value) => {
      calls.push({ key: 'draftFiles', value });
      return value;
    },
    setChannelFiles: (value) => {
      calls.push({ key: 'channelFiles', value });
      return value;
    },
    resetDraftParallelChatTargets: () => {
      resetParallelCalls += 1;
    },
    setDraftWorkflowShape: (value) => {
      calls.push({ key: 'workflowShape', value });
      return value;
    },
    setDraftAudienceKeys: (value) => {
      calls.push({ key: 'audienceKeys', value });
      return value;
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.key),
    [
      'cwd',
      'catIds',
      'temporaryParticipants',
      'highlightedCatId',
      'executionOverrides',
      'runtimeSessionPolicy',
      'draftFiles',
      'channelFiles',
      'workflowShape',
      'audienceKeys',
    ],
  );
  assert.equal(calls[0]?.value, null);
  assert.deepEqual(calls[1]?.value, []);
  assert.deepEqual(calls[2]?.value, []);
  assert.equal(calls[3]?.value, null);
  assert.ok(calls[4]?.value instanceof Map);
  assert.equal((calls[4]?.value as Map<string, unknown>).size, 0);
  assert.deepEqual(calls[5]?.value, createDefaultRuntimeSessionPolicy());
  assert.deepEqual(calls[6]?.value, []);
  assert.deepEqual(calls[7]?.value, []);
  assert.equal(calls[8]?.value, 'sequential');
  assert.equal(calls[9]?.value, null);
  assert.equal(resetParallelCalls, 1);
});

test('resetComposerDraftState tolerates omitted optional setters', () => {
  assert.doesNotThrow(() => {
    resetComposerDraftState({
      setDraftCwd: () => null,
      setDraftCatIds: () => [],
      setDraftHighlightedCatId: () => null,
      setDraftCatExecutionTargetOverrides: () => new Map(),
      setDraftFiles: () => [],
    });
  });
});
