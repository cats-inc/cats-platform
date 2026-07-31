import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

/**
 * These run the real bootstrap page script inside jsdom rather than grepping the
 * generated HTML. The bug they guard is a rendering decision, not a string: an
 * inventory that has never been scanned used to render exactly like one that was
 * scanned and came back empty, so a machine with every CLI installed showed a
 * grid of "Install" buttons.
 */

const NATIVE_PROVIDERS = [
  'claude_code', 'antigravity', 'cursor_agent', 'kiro', 'junie', 'goose', 'ollama',
];
const NPM_PROVIDERS = ['codex', 'copilot', 'opencode', 'kilo', 'auggie', 'pi'];

function candidates(installedProviderIds = []) {
  return [...NATIVE_PROVIDERS, ...NPM_PROVIDERS].map((providerId) => ({
    providerId,
    helperId: `windows-${providerId}-native-installer`,
    label: providerId,
    installed: installedProviderIds.includes(providerId),
    available: true,
    supported: true,
  }));
}

function snapshot(inventory) {
  return {
    phase: 'ready_for_setup',
    app: {
      onboardingMode: 'setup_status',
      setupCompleted: false,
      setupCompleteAt: null,
      entryPath: '/',
    },
    actions: [],
    services: [],
    events: [],
    prerequisites: { cliInventory: inventory },
  };
}

const UNKNOWN_INVENTORY = {
  source: 'unknown',
  installed: [],
  total: 0,
  candidates: candidates(),
  scannedAt: null,
};

const SCANNED_INVENTORY = {
  source: 'runtime',
  installed: ['windows-claude_code-native-installer'],
  total: 1,
  candidates: candidates(['claude_code']),
  scannedAt: '2026-07-31T00:00:00.000Z',
};

/**
 * Boots the page against a stubbed host bridge and resolves once onboarding has
 * rendered. Returns the live document plus the recorded runAction calls.
 */
async function renderPage(inventory) {
  const runActions = [];
  let pushSnapshot = null;
  const dom = new JSDOM(buildDesktopBootstrapPage(), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.catsDesktopHost = {
        getSnapshot: () => Promise.resolve(snapshot(inventory)),
        getSetupSnapshot: () => Promise.resolve(null),
        runSetupHelper: () => Promise.resolve(null),
        runAction: (actionId) => {
          runActions.push(actionId);
          return Promise.resolve(snapshot(inventory));
        },
        onSnapshot: (listener) => {
          pushSnapshot = listener;
          return () => {};
        },
      };
    },
  });

  const { document } = dom.window;
  // The page resolves getSnapshot then getSetupSnapshot before its first render.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (document.querySelectorAll('.cli-card').length > 0) break;
    await new Promise((resolve) => { dom.window.setTimeout(resolve, 10); });
  }

  return {
    dom,
    document,
    runActions,
    pushSnapshot: (next) => pushSnapshot?.(next),
    close: () => dom.window.close(),
  };
}

/**
 * Provider cards only. The Node.js / npm card shares the grid but is built from
 * the setup-helper snapshot rather than from cliInventory, and carries its own
 * "still checking" spinner — it is not part of what these tests cover.
 */
function providerCards(document) {
  return [...document.querySelectorAll('.cli-card')].filter((card) => {
    const name = card.querySelector('.cli-card-name')?.textContent?.trim() ?? '';
    return name !== 'Node.js / npm';
  });
}

function cardButtonLabels(document) {
  return providerCards(document).map((card) => {
    const button = card.querySelector('.cli-card-btn');
    return (button?.textContent ?? '').trim();
  });
}

test('an unscanned CLI inventory renders as not-yet-detected, never as "Install"', async () => {
  const page = await renderPage(UNKNOWN_INVENTORY);
  try {
    const labels = cardButtonLabels(page.document);
    assert.ok(labels.length > 0, 'expected the onboarding CLI grid to render');

    // The whole point: nothing may claim the CLI is absent before we looked.
    assert.equal(
      labels.includes('Install'),
      false,
      `unscanned inventory must not offer Install; got ${JSON.stringify(labels)}`,
    );
    assert.deepEqual(
      [...new Set(labels)],
      ['Detect'],
      'every unscanned provider card should offer Detect',
    );
    assert.match(page.document.body.textContent, /Not detected yet/);

    // Detect must stay clickable even for the npm-group cards that sit behind
    // the Node prerequisite — an already-installed codex has nothing to do with
    // whether we are ready to install one.
    const npmCardEnabled = providerCards(page.document).some((card) => {
      const name = card.querySelector('.cli-card-name')?.textContent?.trim();
      return name === 'Codex' && !card.querySelector('.cli-card-btn').disabled;
    });
    assert.ok(npmCardEnabled, 'the Codex card should stay clickable while unknown');
  } finally {
    page.close();
  }
});

test('a scanned CLI inventory still distinguishes installed from missing', async () => {
  const page = await renderPage(SCANNED_INVENTORY);
  try {
    const labels = cardButtonLabels(page.document);
    assert.ok(
      labels.includes('Reinstall'),
      `installed CLI should offer Reinstall; got ${JSON.stringify(labels)}`,
    );
    assert.ok(
      labels.includes('Install'),
      `a scanned-and-missing CLI should still offer Install; got ${JSON.stringify(labels)}`,
    );
    assert.equal(
      labels.includes('Detect'),
      false,
      `a scanned inventory has nothing left to detect; got ${JSON.stringify(labels)}`,
    );
  } finally {
    page.close();
  }
});

test('clicking Detect asks the host to rescan instead of installing', async () => {
  const page = await renderPage(UNKNOWN_INVENTORY);
  try {
    const detectButton = [...page.document.querySelectorAll('.cli-card-btn')]
      .find((button) => button.textContent.trim() === 'Detect');
    assert.ok(detectButton, 'expected a Detect button on an unscanned card');

    detectButton.click();
    await new Promise((resolve) => { page.dom.window.setTimeout(resolve, 0); });

    assert.deepEqual(page.runActions, ['retry_cli_scan']);
  } finally {
    page.close();
  }
});

test('a successful install forces a rescan so the new CLI is not left stale', async () => {
  const page = await renderPage(SCANNED_INVENTORY);
  try {
    const installButton = providerCards(page.document)
      .map((card) => card.querySelector('.cli-card-btn'))
      .find((button) => button.textContent.trim() === 'Install');
    assert.ok(installButton, 'expected an Install button on a scanned-and-missing card');

    installButton.click();
    // runSetupHelper resolves, then the rescan is chained behind it.
    for (let attempt = 0; attempt < 10 && page.runActions.length === 0; attempt += 1) {
      await new Promise((resolve) => { page.dom.window.setTimeout(resolve, 0); });
    }

    assert.deepEqual(page.runActions, ['retry_cli_scan']);
  } finally {
    page.close();
  }
});

test('onboarding offers a scan button whose label reflects whether we have scanned', async () => {
  const unknownPage = await renderPage(UNKNOWN_INVENTORY);
  try {
    const actions = [...unknownPage.document.querySelectorAll('.onboarding-actions .btn')]
      .map((button) => button.textContent.trim());
    assert.ok(
      actions.includes('Detect installed CLIs'),
      `expected a scan-all button; got ${JSON.stringify(actions)}`,
    );
  } finally {
    unknownPage.close();
  }

  const scannedPage = await renderPage(SCANNED_INVENTORY);
  try {
    const actions = [...scannedPage.document.querySelectorAll('.onboarding-actions .btn')]
      .map((button) => button.textContent.trim());
    assert.ok(
      actions.includes('Detect again'),
      `expected a rescan button once scanned; got ${JSON.stringify(actions)}`,
    );
  } finally {
    scannedPage.close();
  }
});

test('the scan-all button reaches the host', async () => {
  const page = await renderPage(UNKNOWN_INVENTORY);
  try {
    const scanButton = [...page.document.querySelectorAll('.onboarding-actions .btn')]
      .find((button) => button.textContent.trim() === 'Detect installed CLIs');
    assert.ok(scanButton, 'expected the scan-all button');

    scanButton.click();
    await new Promise((resolve) => { page.dom.window.setTimeout(resolve, 0); });

    assert.deepEqual(page.runActions, ['retry_cli_scan']);
  } finally {
    page.close();
  }
});
