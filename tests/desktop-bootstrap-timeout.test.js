import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

const flush = async () => { await new Promise(setImmediate); };

async function loadingPage(t, { setupPending = false } = {}) {
  const timers = new Map();
  let now = 0;
  let timerId = 0;
  let listener;
  const actions = [];
  const snapshot = {
    phase: 'checking_prerequisites', status: 'degraded', summary: 'Checking prerequisites',
    lastError: null, issues: [], actions: [{ id: 'quit', label: 'Quit Cats' }],
    services: ['cats-runtime', 'cats-platform'].map(name => ({ name, ready: true, status: 'ready' })),
    app: { setupCompleted: true, setupCompleteAt: '2026-10-22T00:00:00Z' },
    prerequisites: {}, runtime: {}, setup: {}, diagnostics: null,
  };
  const dom = new JSDOM(buildDesktopBootstrapPage(), {
    runScripts: 'dangerously', url: 'http://desktop-fixture.invalid',
    beforeParse(window) {
      window.setTimeout = (callback, ms) => {
        const id = ++timerId;
        timers.set(id, { callback, at: now + ms });
        return id;
      };
      window.clearTimeout = id => timers.delete(id);
      window.catsDesktopHost = {
        getSnapshot: async () => snapshot,
        getSetupSnapshot: () => setupPending ? new Promise(() => {}) : Promise.resolve(null),
        onSnapshot: callback => { listener = callback; },
        runAction: async action => { actions.push(action); },
      };
    },
  });
  t.after(() => dom.window.close());
  await flush();
  const advance = async ms => {
    const end = now + ms;
    for (;;) {
      const next = [...timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
      await flush();
    }
    now = end;
  };
  return { document: dom.window.document, advance, actions,
    publish: async changes => { listener({ ...snapshot, ...changes }); await flush(); } };
}

test('three slow hints are followed by recovery with working diagnostics and retry', async t => {
  const page = await loadingPage(t);
  const error = page.document.getElementById('error-area');
  await page.advance(60_000);
  assert.match(page.document.getElementById('slow-hint').textContent, /last step|almost|really/i);
  assert.equal(error.classList.contains('visible'), false);
  // Repeated progress snapshots must not extend the deadline.
  await page.publish({ timestamp: 'later' });
  await page.advance(19_999);
  assert.equal(error.classList.contains('visible'), false);
  await page.advance(1);
  assert.equal(error.classList.contains('visible'), true);
  page.document.getElementById('btn-details').click();
  assert.match(page.document.querySelector('.recovery-desc').textContent, /taking too long/);
  assert.match(page.document.body.textContent, /Advanced diagnostics/);
  assert.match(page.document.body.textContent, /Runtime/);
  assert.match(page.document.body.textContent, /Startup is taking too long/);
  const retry = [...page.document.querySelectorAll('.recovery-actions button')]
    .find(button => button.textContent === 'Retry');
  retry.click();
  await flush();
  assert.deepEqual(page.actions, ['retry']);
  assert.equal(error.classList.contains('visible'), false);
  await page.advance(79_999);
  assert.equal(error.classList.contains('visible'), false);
  await page.advance(1);
  assert.equal(error.classList.contains('visible'), true);
});

test('late readiness cancels recovery and helper snapshot reads cannot block the deadline', async t => {
  const page = await loadingPage(t, { setupPending: true });
  await page.advance(80_000);
  assert.equal(page.document.getElementById('error-area').classList.contains('visible'), true);
  await page.publish({ phase: 'ready_for_chat', status: 'ok' });
  assert.equal(page.document.getElementById('error-area').classList.contains('visible'), false);
  await page.advance(160_000);
  assert.equal(page.document.getElementById('error-area').classList.contains('visible'), false);
});

test('a terminal host check failure immediately exposes its actual diagnostic', async t => {
  const page = await loadingPage(t);
  await page.advance(1_000);
  await page.publish({ phase: 'failed', status: 'unavailable',
    lastError: 'Failed to read Cats startup state: TimeoutError',
    issues: [{ id: 'host-startup-error', severity: 'error',
      title: 'Desktop host failed to finish startup', detail: 'app-shell request timed out' }],
  });
  assert.equal(page.document.getElementById('error-area').classList.contains('visible'), true);
  page.document.getElementById('btn-details').click();
  assert.match(page.document.querySelector('.recovery-desc').textContent, /Startup checks did not finish/);
  assert.match(page.document.body.textContent, /app-shell request timed out/);
});

test('readiness before the deadline cancels the pending timeout', async t => {
  const page = await loadingPage(t);
  await page.advance(40_000);
  await page.publish({ phase: 'ready_for_chat', status: 'ok' });
  await page.advance(80_000);
  assert.equal(page.document.getElementById('error-area').classList.contains('visible'), false);
});
