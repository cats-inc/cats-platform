import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialCompareTargets,
  createNextCompareTarget,
} from '../src/products/chat/renderer/hooks/useParallelChatDraft.ts';
import {
  getDefaultModel,
  getDefaultProviderInstance,
} from '../src/shared/providerCatalog.ts';

test('parallel draft seeds fallback targets with each provider default model and instance', () => {
  const baseTarget = {
    provider: 'claude',
    model: 'opus',
    instance: 'native',
    modelSelection: null,
  };

  const [leadTarget, followerTarget] = createInitialCompareTargets(baseTarget);

  assert.deepEqual(leadTarget, baseTarget);
  assert.equal(followerTarget.provider, 'codex');
  assert.equal(followerTarget.model, getDefaultModel('codex'));
  assert.equal(followerTarget.instance, getDefaultProviderInstance('codex'));
});

test('parallel draft adds later targets with provider defaults instead of blank model labels', () => {
  const targets = createInitialCompareTargets({
    provider: 'claude',
    model: 'opus',
    instance: 'native',
    modelSelection: null,
  });

  const nextTarget = createNextCompareTarget(targets, targets[0]!);

  assert.equal(nextTarget.provider, 'gemini');
  assert.equal(nextTarget.model, getDefaultModel('gemini'));
  assert.equal(nextTarget.instance, getDefaultProviderInstance('gemini'));
});
