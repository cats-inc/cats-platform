import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDesktopCliInventoryFromRuntime, probeContradictsCachedBootstrapState } from '../build/desktop/cliInventoryProbe.js';
import { nativeSetupTarget } from '../build/desktop/providerSelection.js';

function probe(providers, overrides = {}) {
  const targets = providers.map(({ provider }) => nativeSetupTarget(provider));
  return { selection: { state: targets.length ? 'selected' : 'empty', revision: 'one', targets,
    nativeSetupTargets: targets, diskChanged: false, error: null }, universe: [],
    observations: providers.filter((entry) => typeof entry.available === 'boolean').map((entry) => ({ ...nativeSetupTarget(entry.provider), ...entry, observedAt: '2026-09-16T00:00:00.000Z', configurationStatus: 'unchanged' })),
    scan: { revision: 'one', scannedAt: '2026-09-16T00:00:00.000Z',
      providers: providers.map((entry) => ({ ...nativeSetupTarget(entry.provider), ...entry })) }, ...overrides };
}

test('missing selection never expands to the complete static installer catalog', () => {
  assert.deepEqual(buildDesktopCliInventoryFromRuntime(null, 'win32').candidates, []);
  assert.deepEqual(buildDesktopCliInventoryFromRuntime({ scan: null }, 'win32').candidates, []);
});

for (const [platform, prefix] of [['win32', 'windows'], ['darwin', 'macos'], ['linux', 'linux']]) {
  test(platform + ' inventory contains selected native installers only', () => {
    const inventory = buildDesktopCliInventoryFromRuntime(probe([
      { provider: 'claude', available: true, authStatus: 'missing' },
      { provider: 'codex', available: false },
    ]), platform);
    assert.equal(inventory.source, 'runtime');
    assert.equal(inventory.candidates.length, 2);
    assert.deepEqual(inventory.installed, [prefix + '-claude-native-installer']);
    assert.equal(inventory.candidates.find((entry) => entry.providerId === 'claude_code').authStatus, 'missing');
  });
}

test('retains selected unavailable providers before the first scan', () => {
  const inventory = buildDesktopCliInventoryFromRuntime(probe([{ provider: 'codex' }], { scan: null }), 'win32');
  assert.equal(inventory.source, 'runtime');
  assert.equal(inventory.scannedAt, null);
  assert.equal(inventory.candidates.length, 1);
  assert.equal(inventory.candidates[0].installed, false);
});

test('ignores observations from old revisions and targets with the same bare instance name', () => {
  const data = probe([{ provider: 'codex', available: true }]);
  data.observations[0].configurationStatus = 'changed';
  assert.equal(buildDesktopCliInventoryFromRuntime(data, 'linux').total, 0);
  data.observations[0].configurationStatus = 'unchanged';
  data.observations[0].backend = 'api';
  assert.equal(buildDesktopCliInventoryFromRuntime(data, 'linux').total, 0);
});

test('non-native configurations named native have no local installer', () => {
  const data = probe([{ provider: 'codex', available: true }]);
  data.selection.nativeSetupTargets = [];
  assert.deepEqual(buildDesktopCliInventoryFromRuntime(data, 'win32').candidates, []);
});

test('selected local Ollama can use a matching Runtime observation', () => {
  const inventory = buildDesktopCliInventoryFromRuntime(probe([{ provider: 'ollama', available: true }]), 'linux');
  assert.deepEqual(inventory.installed, ['linux-ollama-local-model-installer']);
});

test('probe bootstrap signals invalidate contradictory health without inventing missing signals', () => {
  assert.equal(probeContradictsCachedBootstrapState({ bootstrapRequired: false, scan: null }, true), true);
  assert.equal(probeContradictsCachedBootstrapState({ bootstrapRequired: true, scan: null }, false), true);
  assert.equal(probeContradictsCachedBootstrapState({ bootstrapRequired: false, scan: null }, false), false);
  assert.equal(probeContradictsCachedBootstrapState(null, true), false);
  assert.equal(probeContradictsCachedBootstrapState({ scan: null }, true), false);
});
