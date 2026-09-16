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
  f.button('show-more').click();
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

test('onboarding keeps the original compact cards and grouping without a provider search form', async (t) => {
  const f = fixture(t, 'onboarding', true); await flush();
  const names = ['claude', 'antigravity', 'cursor', 'kiro', 'junie', 'goose', 'grok', 'devin', 'muse', 'ollama',
    'codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi', 'cline', 'openclaw'];
  f.snapshot.runtime.universe = names.map((provider) => ({ provider, backend: 'cli', instance: 'native', familyLabel: provider }));
  await f.view.refresh();
  const order = () => [...f.root.querySelectorAll('.cli-card')].map((card) => card.dataset.provider || 'node');
  assert.deepEqual(order(), ['claude', 'antigravity', 'node', 'codex']);
  assert.equal(f.root.querySelector('input[type=search]'), null);
  assert.equal(f.root.querySelector('[data-prerequisite] input[type=checkbox]'), null);
  f.button('show-more').click();
  assert.deepEqual(order(), [...names.slice(0, 10), 'node', ...names.slice(10)]);
  assert.ok(f.root.querySelector('[data-group=npm]'));
  f.choice('pi').click();
  f.button('show-more').click();
  assert.deepEqual(order(), ['claude', 'antigravity', 'node', 'codex', 'pi']);
  assert.deepEqual(f.calls, []);
});

test('Node/npm preparation is actionable on an empty fresh machine and never saves or scans providers', async (t) => {
  const f = fixture(t, 'onboarding', true); await flush();
  const missing = { runState: 'completed', status: 'not_installed', summary: 'Node missing', warnings: [], manualSteps: [], plannedActions: [] };
  f.snapshot.prerequisites = ['node-host-installer', 'npm-prefix-helper', 'github-cli-installer'].map((suffix) => ({
    helperId: `windows-${suffix}`, checking: false, result: suffix === 'node-host-installer' ? missing : null,
  }));
  f.snapshot.helpers.push(...f.snapshot.prerequisites.map((entry) => ({ id: entry.helperId, available: true, supported: true, supportsApply: true })));
  const helpers = [];
  const installed = new Set();
  f.bridge.runSetupHelper = async (id, mode) => {
    helpers.push([id, mode]);
    if (mode === 'apply') installed.add(id);
    const result = { ...missing, status: mode === 'apply' ? 'restart_required' : installed.has(id) ? 'ready' : 'changes_required', summary: 'Checked' };
    f.snapshot.prerequisites.find((entry) => entry.helperId === id).result = result;
    return { state: { lastAction: result } };
  };
  await f.view.refresh();
  assert.match(f.root.querySelector('[data-prerequisite=node] .pm-status').textContent, /Not installed/);
  assert.equal(f.button('prepare-node').disabled, false);
  f.button('prepare-node').click(); await flush(); await flush();
  assert.deepEqual(helpers, [['windows-node-host-installer', 'apply'], ['windows-node-host-installer', 'check'],
    ['windows-npm-prefix-helper', 'check'], ['windows-npm-prefix-helper', 'apply'], ['windows-npm-prefix-helper', 'check']]);
  assert.match(f.root.querySelector('[data-prerequisite=node] .pm-status').textContent, /Installed/);
  assert.deepEqual(f.calls, []);
  assert.equal(f.button('continue').disabled, true);
});

test('technical observations and maintenance stay under closed details in Settings', async (t) => {
  const f = fixture(t); await flush();
  const row = f.root.querySelector('[data-provider=codex]');
  assert.equal(row.querySelector('.pm-status').textContent, 'Installed');
  const details = row.querySelector('details');
  assert.equal(details.open, false);
  assert.match(details.textContent, /Last checked/);
  assert.match(details.textContent, /Sign-in has not been verified/);
  const uninstall = [...row.querySelectorAll('button')].find((entry) => entry.textContent === 'Uninstall…');
  assert.equal(uninstall.closest('details'), details);
});

test('custom connections remain distinguishable while their execution details stay collapsed', async (t) => {
  const f = fixture(t); await flush();
  f.snapshot.runtime.selection.targets = [
    { ...codex, instance: 'work-laptop' }, { ...codex, instance: 'personal' },
  ];
  f.snapshot.runtime.selection.revision = 'custom';
  await f.view.refresh();
  const choices = [...f.root.querySelectorAll('[data-provider=codex] input')];
  assert.ok(choices.some((entry) => entry.getAttribute('aria-label').includes('work-laptop')));
  assert.ok(choices.some((entry) => entry.getAttribute('aria-label').includes('personal')));
  const custom = [...f.root.querySelectorAll('[data-provider=codex]')].find((entry) => entry.textContent.includes('work-laptop'));
  assert.equal(custom.querySelector('details').open, false);
  assert.match(custom.querySelector('details').textContent, /cli \/ work-laptop/);
  custom.querySelector('input').click();
  f.button('apply').click(); await flush(); await flush();
  assert.deepEqual(f.calls[0].targets, [{ ...codex, instance: 'personal' }]);
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

test('selection edits and detection retain list position and expanded provider controls', async (t) => {
  const f = fixture(t); await flush();
  f.root.querySelector('.pm-list').scrollTop = 320;
  f.root.querySelector('.pm-more').open = true;
  f.choice('pi').click();
  assert.equal(f.root.querySelector('.pm-list').scrollTop, 320);
  assert.equal(f.root.querySelector('.pm-more').open, true);
  f.button('apply').click(); await flush(); await flush();
  f.button('detect-selected').click(); await flush(); await flush();
  assert.equal(f.root.querySelector('.pm-list').scrollTop, 320);
  assert.equal(f.root.querySelector('.pm-more').open, true);
});
