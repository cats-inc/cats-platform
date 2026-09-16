import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { mountProviderManager } from '../packages/provider-setup/manager.js';

const codex = { provider: 'codex', backend: 'cli', instance: 'native' };
const pi = { provider: 'pi', backend: 'cli', instance: 'native' };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const defer = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture(t, context = 'settings', missing = false) {
  const dom = new JSDOM('<main></main>', { url: 'http://fixture.invalid' });
  let snapshot = { runtime: { selection: { state: missing ? 'missing' : 'selected', revision: missing ? 'missing' : 'one',
    targets: missing ? [] : [codex], nativeSetupTargets: [codex, pi], diskChanged: false, error: null },
    universe: [codex, pi].map((entry) => ({ ...entry, familyLabel: entry.provider })),
    observations: missing ? [] : [{ ...codex, commandStatus: 'ready', available: true, observedAt: '2026-09-16T00:00:00Z', configurationStatus: 'unchanged' }], state: { status: 'ready' } },
    helpers: [{ id: 'windows-codex-native-installer', available: true, supported: true, supportsApply: true, supportsUpgrade: true, supportsForce: true, supportsUninstall: true }],
    platform: 'windows', operations: [], outcomes: {} };
  const calls = []; const bridge = {
    getProviderSetup: async () => structuredClone(snapshot),
    applyProviderSetup: async (input) => { calls.push(input); snapshot.runtime.selection = { ...snapshot.runtime.selection,
      state: input.targets.length ? 'selected' : 'empty', revision: 'two', targets: input.targets }; return structuredClone(snapshot); },
    runProviderSetup: async (input) => { calls.push(input); return structuredClone(snapshot); },
  };
  const root = dom.window.document.querySelector('main');
  const view = mountProviderManager(root, bridge, { context, onContinue: async () => calls.push('continue') });
  t.after(() => { view.destroy(); dom.window.close(); });
  return { root, view, bridge, calls, snapshot, button: (action) => root.querySelector(`[data-action="${action}"]`),
    choice: (name) => root.querySelector(`[data-provider="${name}"] input[type=checkbox]`) };
}

test('new users explicitly select intent; Apply stays busy until detection finishes; Continue never requires readiness', async (t) => {
  const f = fixture(t, 'onboarding', true); await flush();
  assert.equal(f.choice('codex').checked, false);
  assert.equal(f.button('detect-after').checked, true);
  assert.equal(f.button('continue').disabled, true);
  f.choice('pi').click();
  const gate = defer(); const apply = f.bridge.applyProviderSetup;
  f.bridge.applyProviderSetup = async (input) => { await gate.promise; return apply(input); };
  f.button('apply').click(); await flush();
  assert.match(f.root.textContent, /Applying and detecting/);
  assert.ok(f.root.querySelector('.pm-spinner'));
  assert.equal(f.choice('pi').checked, true);
  assert.doesNotMatch(f.root.textContent, /Selection applied/);
  gate.resolve(); await flush(); await flush();
  assert.equal(f.button('continue').disabled, false);
  assert.deepEqual(f.calls[0].targets, [pi]);
  assert.equal(f.calls[0].detectAfter, true);
});

test('Settings Apply defaults to save-only and retains previous results with stable footer', async (t) => {
  const f = fixture(t); await flush();
  f.choice('pi').click();
  assert.equal(f.button('detect-after').checked, false);
  f.button('apply').click(); await flush(); await flush();
  assert.match(f.root.querySelector('[data-provider="codex"]').textContent, /Installed/);
  assert.ok(f.button('detect-selected').closest('.pm-footer'));
  assert.ok(f.button('continue').closest('.pm-footer'));
  assert.equal(f.calls[0].detectAfter, false);
});

test('a late passive read cannot roll back a completed Apply or its revision', async (t) => {
  const f = fixture(t); await flush();
  const old = structuredClone(f.snapshot); const gate = defer();
  const read = f.bridge.getProviderSetup;
  f.bridge.getProviderSetup = () => gate.promise;
  const pending = f.view.refresh();
  f.choice('pi').click(); f.button('apply').click(); await flush();
  f.bridge.getProviderSetup = read;
  gate.resolve(old); await pending; await flush();
  f.button('detect-selected').click(); await flush();
  assert.equal(f.calls[1].expectedRevision, 'two');
  assert.deepEqual(f.calls[1].targets, [codex, pi]);
});

test('a changed revision invalidates an uninstall preview', async (t) => {
  const f = fixture(t); await flush();
  f.bridge.runProviderSetup = async () => ({ ...structuredClone(f.snapshot), preview: { target: codex, revision: 'one',
    result: { runState: 'completed', summary: 'Remove local command', plannedActions: ['isolated/codex'], warnings: [], manualSteps: [] } } });
  [...f.root.querySelectorAll('button')].find((button) => button.textContent === 'Uninstall…').click(); await flush();
  assert.ok(f.root.querySelector('[role=dialog]'));
  assert.equal(f.choice('codex').disabled, true);
  f.snapshot.runtime.selection.revision = 'external';
  await f.view.refresh();
  assert.equal(f.root.querySelector('[role=dialog]'), null);
});
