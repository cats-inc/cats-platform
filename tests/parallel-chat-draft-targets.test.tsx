import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialCompareTargets,
  createNextCompareTarget,
  syncLeadCompareTarget,
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

  assert.equal(nextTarget.provider, 'antigravity');
  assert.equal(nextTarget.model, getDefaultModel('antigravity'));
  assert.equal(nextTarget.instance, getDefaultProviderInstance('antigravity'));
});

test('parallel draft treats target-level CLI provider ids as occupied provider aliases', () => {
  const currentTargets = [
    {
      provider: 'claude-cli',
      model: 'opus',
      instance: null,
      modelSelection: null,
    },
    {
      provider: 'codex-cli',
      model: 'gpt-5.4',
      instance: null,
      modelSelection: null,
    },
  ];

  const nextTarget = createNextCompareTarget(currentTargets, currentTargets[0]!);

  assert.equal(nextTarget.provider, 'antigravity');
  assert.equal(nextTarget.model, getDefaultModel('antigravity'));
  assert.equal(nextTarget.instance, getDefaultProviderInstance('antigravity'));
});

test('parallel draft keeps the first target synchronized with the shared draft default', () => {
  const syncedTargets = syncLeadCompareTarget(
    [
      {
        provider: 'claude',
        model: 'opus',
        instance: 'native',
        modelSelection: null,
      },
      {
        provider: 'codex',
        model: 'gpt-5.4',
        instance: 'cli/native',
        modelSelection: null,
      },
    ],
    {
      provider: 'antigravity',
      model: 'antigravity-default',
      instance: 'cli/native',
      modelSelection: {
        mode: 'preset',
        presetId: 'balanced',
        controls: [],
      },
    },
  );

  assert.deepEqual(syncedTargets[0], {
    provider: 'antigravity',
    model: 'antigravity-default',
    instance: 'cli/native',
    modelSelection: {
      mode: 'preset',
      presetId: 'balanced',
      controls: [],
    },
  });
  assert.deepEqual(syncedTargets[1], {
    provider: 'codex',
    model: 'gpt-5.4',
    instance: 'cli/native',
    modelSelection: null,
  });
});
