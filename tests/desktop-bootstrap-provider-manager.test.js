import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

const codex = { provider: 'codex', backend: 'cli', instance: 'native' };
const muse = { provider: 'muse', backend: 'cli', instance: 'native' };
const ollama = { provider: 'ollama', backend: 'local', instance: 'local' };
const all = [codex, muse, ollama];
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function page(t, { observations = [], selected = [codex, ollama], recovery = false, setup = null, scanned = false } = {}) {
  const selection = { state: 'selected', revision: 'one', targets: selected,
    nativeSetupTargets: all, diskChanged: false, error: null };
  const helpers = all.map((target) => ({
    id: target === ollama ? 'windows-ollama-local-model-installer' : `windows-${target.provider}-native-installer`,
    available: true, supported: true, supportsApply: true, supportsUpgrade: true, supportsForce: true, supportsUninstall: true,
  }));
  let state = { runtime: { selection, universe: all.map((entry) => ({ ...entry, familyLabel: entry.provider })),
    observations, connections: [{ ...ollama, endpoint: 'http://127.0.0.1:11434', editable: true }],
    state: { status: 'ready' } }, helpers, platform: 'windows', operations: [], outcomes: {} };
  const snapshot = { phase: recovery ? 'failed' : 'ready_for_setup', summary: 'Setup fixture',
    app: { onboardingMode: 'setup_status', setupCompleted: recovery }, actions: [], services: [], events: [],
    prerequisites: { providerSelection: selection, providerCatalog: state.runtime.universe,
      cliInventory: { source: 'runtime', installed: [], total: 0, scannedAt: scanned ? '2026-09-16T00:00:00Z' : null,
        candidates: [{ providerId: 'codex', helperId: 'windows-codex-native-installer', label: 'Codex',
          installed: false, available: true, supported: true },
        { providerId: 'ollama', helperId: 'windows-ollama-local-model-installer', label: 'Ollama',
          installed: false, available: true, supported: true }] } } };
  const actions = []; const oldActions = []; const helperActions = [];
  const dom = new JSDOM(buildDesktopBootstrapPage(), { url: 'http://localhost/', runScripts: 'dangerously',
    beforeParse(window) {
      window.catsDesktopHost = {
        getSnapshot: async () => snapshot, getSetupSnapshot: async () => setup, onSnapshot: () => () => {},
        runSetupHelper: async (...args) => { helperActions.push(args); return setup; },
        getProviderSetup: async () => structuredClone(state),
        runAction: async (action) => { oldActions.push(action); return snapshot; },
        runProviderSetup: async (input) => { actions.push(JSON.parse(JSON.stringify(input))); return structuredClone(state); },
      };
    },
  });
  t.after(() => dom.window.close());
  await settle();
  const root = dom.window.document;
  return { root, state, actions, oldActions, helperActions, bridge: dom.window.catsDesktopHost,
    row: (id) => root.querySelector(`[data-provider="${id}"]`),
    button: (id, action) => root.querySelector(`[data-provider="${id}"] [data-action="${action}"]`) };
}

test('onboarding distinguishes selected-but-unchecked providers from providers outside the saved scope', async (t) => {
  const p = await page(t);
  assert.match(p.row('codex').textContent, /Not detected/);
  assert.equal(p.button('codex', 'detect').disabled, false);
  assert.equal(p.button('codex', 'install').disabled, false);
  assert.match(p.row('muse').textContent, /Not selected/);
  assert.equal(p.button('muse', 'install'), null);
  assert.equal(p.root.querySelector('.cli-card'), null);
});

const recoveryHelpers = ['windows-node-host-installer', 'windows-ollama-local-model-installer', 'windows-codex-native-installer']
  .map((id) => ({ id, kind: 'prerequisite_helper', pack: 'native_cli_pack', supportsCheckOnly: true,
    supportsApply: true, available: true, supported: true, unsupportedReason: null }));
const audit = (plannedActions, extra = {}) => ({ helpers: recoveryHelpers, resumeAction: null,
  state: { lastAction: plannedActions === null ? null : { helperId: 'windows-install-readiness-audit',
    mode: 'check', runState: 'completed', status: 'ready', plannedActions, warnings: [], appliedChanges: [],
    manualSteps: [], interruptions: [], ...extra } } });
async function recoveryPage(t, setup, scanned = true) {
  const p = await page(t, { recovery: true, setup, scanned });
  [...p.root.querySelectorAll('button')].find((button) => /Show details/.test(button.textContent)).click();
  await settle();
  p.card = (name) => [...p.root.querySelectorAll('.cli-card')].find((entry) => entry.querySelector('.cli-card-name')?.textContent.trim() === name);
  return p;
}

test('recovery prerequisite cards distinguish checking, installed services, and missing dependencies', async (t) => {
  const checking = await recoveryPage(t, audit(null));
  assert.match(checking.card('Node.js / npm').textContent, /Checking/);
  const installed = await recoveryPage(t, audit(['local_model:start_ollama_local_model']));
  assert.match(installed.card('Ollama').textContent, /Installed/);
  const missing = await recoveryPage(t, audit(['install_node_lts', 'local_model:install_ollama_local_model']));
  assert.match(missing.card('Node.js / npm').textContent, /Not installed/);
  assert.match(missing.card('Ollama').textContent, /Not installed/);
  assert.equal(missing.card('Codex').querySelector('.cli-card-btn').disabled, true);
  const failed = await recoveryPage(t, audit([], { runState: 'failed', status: 'failed' }));
  assert.match(failed.card('Node.js / npm').textContent, /Not installed/);
  assert.equal(failed.card('Node.js / npm').querySelector('.cli-card-btn').disabled, false);
});

test('the retained recovery install action refreshes its inventory after completion', async (t) => {
  const p = await recoveryPage(t, audit([]));
  p.card('Codex').querySelector('.cli-card-btn').click(); await settle(); await settle();
  assert.equal(p.helperActions.length, 1);
  assert.ok(p.oldActions.includes('retry_cli_scan'));
});

test('a row Detect requests its exact target and never triggers the old whole-inventory action', async (t) => {
  const p = await page(t);
  p.button('codex', 'detect').click(); await settle();
  assert.deepEqual(p.actions, [{ action: 'detect', targets: [codex], expectedRevision: 'one' }]);
  assert.deepEqual(p.oldActions, []);
});

test('Detect selected excludes unselected providers and stays in the action footer', async (t) => {
  const p = await page(t);
  const button = p.root.querySelector('[data-action=detect-selected]');
  assert.ok(button.closest('.pm-footer'));
  button.click(); await settle();
  assert.deepEqual(p.actions[0].targets, [codex, ollama]);
});

test('Meta Muse is selectable and uses the same per-provider install action', async (t) => {
  const p = await page(t, { selected: [muse] });
  p.button('muse', 'install').click(); await settle();
  assert.deepEqual(p.actions, [{ action: 'install', targets: [muse], expectedRevision: 'one' }]);
  assert.deepEqual(p.oldActions, []);
});

test('installed Ollama with a stopped endpoint offers connection testing without another Install', async (t) => {
  const p = await page(t, { observations: [{ ...ollama, commandStatus: 'ready', connectionStatus: 'failed',
    available: false, configurationStatus: 'unchanged', observedAt: '2026-09-16T00:00:00Z' }] });
  assert.equal(p.button('ollama', 'install'), null);
  assert.match(p.row('ollama').textContent, /Connection failed/);
  assert.equal(p.button('ollama', 'detect').textContent, 'Test Connection');
  p.button('ollama', 'detect').click(); await settle();
  assert.deepEqual(p.actions[0].targets, [ollama]);
});

test('a failed installer remains visible alongside retained installation evidence and manual steps', async (t) => {
  const p = await page(t, { observations: [{ ...codex, commandStatus: 'ready', available: true,
    authStatus: 'unknown', configurationStatus: 'unchanged', observedAt: '2026-09-16T00:00:00Z' }] });
  p.bridge.runProviderSetup = async () => { p.state.outcomes = {
    [JSON.stringify(['codex', 'cli', 'native'])]: { runState: 'failed', status: 'failed',
      summary: 'Upgrade failed', manualSteps: ['Retry after closing the CLI'], warnings: [] },
  }; return structuredClone(p.state); };
  [...p.row('codex').querySelectorAll('button')].find((button) => button.textContent === 'Upgrade').click();
  await settle();
  assert.match(p.row('codex').textContent, /Installed/);
  assert.match(p.row('codex').textContent, /Upgrade failed/);
  assert.match(p.row('codex').textContent, /Retry after closing the CLI/);
});

test('the explicit recovery accordion still distinguishes unscanned inventory from missing commands', async (t) => {
  const p = await page(t, { recovery: true });
  const details = [...p.root.querySelectorAll('button')].find((button) => /Show details/.test(button.textContent));
  assert.ok(details);
  details.click(); await settle();
  const card = [...p.root.querySelectorAll('.cli-card')].find((entry) => /Codex/.test(entry.textContent));
  assert.ok(card);
  assert.match(card.textContent, /Not detected yet/);
  assert.equal(card.querySelector('.cli-card-btn').textContent.trim(), 'Detect');
});
