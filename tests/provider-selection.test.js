import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveCatalogTargetSelection,
  resolveSelectedProviderInstance,
} from '../dist-server/shared/providerSelection.js';

test('resolveSelectedProviderInstance picks the runtime default instance when none is selected', () => {
  const provider = {
    id: 'codex',
    label: 'Codex',
    defaultModel: null,
    defaultInstance: 'agent/bridge',
    defaultBackend: 'agent',
    instances: [
      { id: 'agent/bridge', label: 'agent/bridge', target: 'agent/bridge', backend: 'agent', default: true },
      { id: 'ubuntu', label: 'cli/ubuntu', target: 'cli/ubuntu', backend: 'cli' },
    ],
    modelsPath: '/api/providers/codex/models',
  };

  assert.equal(resolveSelectedProviderInstance(provider, ''), 'agent/bridge');
  assert.equal(resolveSelectedProviderInstance(provider, 'ubuntu'), 'ubuntu');
});

test('resolveCatalogTargetSelection prefers the runtime catalog default over a stale initial model', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-sonnet-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', default: true },
      ],
      warnings: [],
    },
    preserveCurrentModel: false,
  });

  assert.equal(nextTarget.instance, 'native');
  assert.equal(nextTarget.model, 'claude-sonnet-4-6');
});

test('resolveCatalogTargetSelection keeps a manual model choice for the same provider target', () => {
  const nextTarget = resolveCatalogTargetSelection({
    target: {
      provider: 'claude',
      instance: 'native',
      model: 'claude-opus-4-6',
    },
    catalog: {
      provider: 'claude',
      backend: 'cli',
      instance: 'native',
      defaultModel: 'claude-sonnet-4-6',
      source: 'config',
      cache: null,
      models: [
        { id: 'claude-opus-4-6', label: 'Opus 4.6' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', default: true },
      ],
      warnings: [],
    },
    preserveCurrentModel: true,
  });

  assert.equal(nextTarget.model, 'claude-opus-4-6');
});
