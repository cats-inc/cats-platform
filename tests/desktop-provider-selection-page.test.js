import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

const codex = { provider: 'codex', backend: 'cli', instance: 'native' };
const openclaw = { provider: 'openclaw', backend: 'agent', instance: 'gateway' };
async function page() {
  const saves = [];
  const actions = [];
  const snapshot = { phase: 'ready_for_setup', app: { onboardingMode: 'setup_status', setupCompleted: false },
    actions: [], services: [], events: [], prerequisites: {
      providerSelection: { state: 'missing', revision: 'missing', targets: [], nativeSetupTargets: [], diskChanged: false, error: null },
      providerCatalog: [codex, openclaw].map((target) => ({ ...target, familyLabel: target.provider, binaryName: target.provider })),
      cliInventory: { source: 'runtime', installed: [], total: 0, candidates: [], scannedAt: null },
    } };
  const dom = new JSDOM(buildDesktopBootstrapPage(), { url: 'http://localhost/', runScripts: 'dangerously',
    beforeParse(window) {
      window.catsDesktopHost = {
        getSnapshot: async () => snapshot, getSetupSnapshot: async () => null, onSnapshot: () => () => {},
        runAction: async (action) => { actions.push(action); return snapshot; },
        getProviderSetup: async () => ({ runtime: { selection: snapshot.prerequisites.providerSelection, universe: snapshot.prerequisites.providerCatalog }, helpers: [], platform: 'windows', operations: [], outcomes: {} }),
        applyProviderSetup: async (input) => {
          saves.push(JSON.parse(JSON.stringify(input)));
          snapshot.prerequisites.providerSelection = { ...snapshot.prerequisites.providerSelection,
            state: input.targets.length ? 'selected' : 'empty', revision: 'saved', targets: input.targets };
          return { runtime: { selection: snapshot.prerequisites.providerSelection, universe: snapshot.prerequisites.providerCatalog }, helpers: [], platform: 'windows', operations: [], outcomes: {} };
        },
      };
    },
  });
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 30)); };
  await settle();
  return { dom, saves, actions, settle, document: dom.window.document,
    continueButton: () => dom.window.document.querySelector('[data-action=continue]'),
    save: () => dom.window.document.querySelector('[data-action=apply]').click() };
}

test('first-run provider choices are selectable before detection and save exact targets', async () => {
  const p = await page();
  try {
    assert.equal(p.continueButton().disabled, true);
    p.document.querySelector('[data-action=show-more]').click();
    const choices = p.document.querySelectorAll('.pm-list input[type=checkbox]');
    assert.equal(choices.length, 2);
    assert.equal(choices[1].disabled, false);
    choices[1].click();
    p.save();
    await p.settle();
    assert.deepEqual(p.saves, [{ expectedRevision: 'missing', targets: [openclaw], detectAfter: true, reload: false }]);
    assert.equal(p.continueButton().disabled, false);
  } finally { p.dom.window.close(); }
});

test('an explicit empty selection can continue without scanning or installing any provider', async () => {
  const p = await page();
  try {
    p.save();
    await p.settle();
    assert.deepEqual(p.saves[0].targets, []);
    assert.equal(p.continueButton().disabled, false);
    p.continueButton().click();
    await p.settle();
    assert.deepEqual(p.actions, ['open_setup']);
  } finally { p.dom.window.close(); }
});
