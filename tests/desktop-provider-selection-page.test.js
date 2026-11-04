import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { SETUP_PROVIDER_ORDER } from '../packages/provider-setup/setupFacts.js';
import { PRODUCT_PROVIDER_ORDER } from '../build/server/shared/providerCatalogData.js';
import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

const codex = { provider: 'codex', backend: 'cli', instance: 'native' };
const openclaw = { provider: 'openclaw', backend: 'agent', instance: 'gateway' };
async function page() {
  const saves = [];
  const actions = [];
  const helpers = [];
  let selection = { state: 'missing', revision: 'missing', targets: [], nativeSetupTargets: [], diskChanged: false, error: null };
  const universe = [codex, openclaw].map((target) => ({ ...target, familyLabel: target.provider, binaryName: target.provider }));
  const snapshot = { phase: 'ready_for_setup', app: { onboardingMode: 'setup_status', setupCompleted: false },
    actions: [], services: [], events: [], prerequisites: { providerSelection: selection } };
  const setup = () => ({ runtime: { selection, universe, observations: [], connections: [] }, helpers: [], platform: 'windows', operations: [], outcomes: {} });
  const dom = new JSDOM(buildDesktopBootstrapPage(), { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.catsDesktopHost = {
        getSnapshot: async () => snapshot, getSetupSnapshot: async () => null, onSnapshot: () => () => {},
        runAction: async (action) => { actions.push(action); return snapshot; },
        getProviderSetup: async () => setup(),
        applyProviderSetup: async (input) => {
          saves.push(JSON.parse(JSON.stringify(input)));
          selection = { ...selection, state: input.targets.length ? 'selected' : 'empty', revision: 'saved', targets: input.targets };
          return setup();
        },
        runProviderSetup: async () => setup(),
        setupWizard: {
          facts: async () => ({ platform: 'windows', helpers: {}, signIn: {}, order: SETUP_PROVIDER_ORDER, npmProviders: ['codex'], vcRuntimeFree: ['codex'], ollamaSuggestions: [], state: null, setupComplete: false }),
          runHelper: async (...args) => { helpers.push(args); return null; },
          runs: async () => [], onRun: () => () => {}, saveState: async () => {},
        },
      };
    },
  });
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 40)); };
  await settle();
  return { dom, saves, actions, helpers, settle, document: dom.window.document };
}

test('the page holds the selector order, so a tool sits in the same place everywhere', () => {
  assert.deepEqual(SETUP_PROVIDER_ORDER, [...PRODUCT_PROVIDER_ORDER]);
});

test('first-run choices start nothing, and saving sends exact targets with no detection', async () => {
  const p = await page();
  try {
    assert.deepEqual(p.saves, []);
    assert.deepEqual(p.helpers, []);
    assert.equal(p.document.getElementById('pick-codex').checked, false);
    p.document.getElementById('pick-openclaw').click();
    await p.settle();
    p.document.getElementById('go-check').click();
    await p.settle();
    assert.deepEqual(p.saves, [{ targets: [openclaw], expectedRevision: 'missing', detectAfter: false }]);
    assert.deepEqual(p.actions, []);
  } finally { p.dom.window.close(); }
});

test('an explicit empty selection continues without scanning or installing any provider', async () => {
  const p = await page();
  try {
    p.document.getElementById('go-check').click();
    await p.settle();
    assert.deepEqual(p.saves[0].targets, []);
    assert.deepEqual(p.actions, ['open_setup']);
    assert.deepEqual(p.helpers, []);
  } finally { p.dom.window.close(); }
});
