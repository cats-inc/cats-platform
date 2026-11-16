import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildStandingGrantsNoticeHtml,
  createStandingGrantsNotice,
  createStandingGrantsWatcher,
  standingGrantsNoticeBounds,
  standingGrantsNoticeText,
} from '../build/desktop/standingGrantsNotice.js';
import { desktopControlNoticeBounds } from '../build/desktop/desktopControlNotice.js';

// ADR-155: the host reads Runtime's grants itself and stops them from the notice, tray and hotkey.

const GRANTED = { version: 1, sessions: [{ sessionId: 'session-1', standingGrants: [
  { category: 'computer_use', until: 'session', grantedAt: '2026-11-16T00:00:00.000Z' },
  { category: 'bogus', until: 'session', grantedAt: '2026-11-16T00:00:00.000Z' }] }] };

function fakeFetch(route) {
  const requests = [];
  const fetch = async (url, init) => {
    const parsed = new URL(url);
    const entry = { origin: parsed.origin, path: parsed.pathname, method: init.method, headers: init.headers, body: init.body };
    requests.push(entry);
    const next = route(entry);
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { fetch, requests };
}

function watcher(route, extra = {}) {
  const changes = [];
  const fake = fakeFetch(route);
  const w = createStandingGrantsWatcher({ runtimeBaseUrl: 'http://127.0.0.1:3110', platformBaseUrl: 'http://127.0.0.1:8181',
    desktopKey: 'k'.repeat(40), onChange: (state) => changes.push(state), fetch: fake.fetch, ...extra });
  return { w, changes, requests: fake.requests };
}

test('the watcher reads Runtime directly, keeps known grants as unconfirmed when a read fails, never clears them', async () => {
  let runtimeUp = true;
  const { w, changes, requests } = watcher((r) => !runtimeUp ? new Error('down') : r.path === '/interactions/grants' ? { status: 200, body: GRANTED } : { status: 404 },
    { runtimeKey: 'runtime-secret' });
  await w.poll();
  assert.deepEqual(changes.at(-1), { holders: [{ sessionId: 'session-1', categories: ['computer_use'] }], unconfirmed: false });
  assert.equal(requests[0].origin, 'http://127.0.0.1:3110');
  assert.equal(requests[0].headers.authorization, 'Bearer runtime-secret');
  runtimeUp = false;
  await w.poll();
  assert.deepEqual(changes.at(-1), { holders: [{ sessionId: 'session-1', categories: ['computer_use'] }], unconfirmed: true });
  assert.equal(changes.length, 2, 'only changes are published');
});

test('Stop revokes in Runtime and cancels through Platform at once; it is confirmed only by Runtime', async () => {
  let held = true;
  const { w, requests } = watcher((r) => {
    if (r.path === '/interactions/grants') return { status: 200, body: held ? GRANTED : { version: 1, sessions: [] } };
    if (r.method === 'DELETE') { held = false; return { status: 200, body: { standingGrants: [] } }; }
    if (r.path === '/api/internal/provider-grants/host-cancel') return { status: 200, body: { channels: ['c'], sessions: 1 } };
    return { status: 500 };
  });
  await w.poll();
  assert.equal(await w.stop(), true);
  const cancel = requests.find((r) => r.path === '/api/internal/provider-grants/host-cancel');
  assert.equal(cancel.headers['x-cats-desktop-auth-key'], 'k'.repeat(40));
  assert.deepEqual(JSON.parse(cancel.body), { sessionIds: ['session-1'] });
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path === '/sessions/session-1/interactions/grants'));
  assert.equal(requests.some((r) => r.path.endsWith('/cancel') && r.origin.endsWith(':3110')), false, 'Platform cancelled it');
  assert.deepEqual(w.current(), { holders: [], unconfirmed: false });
});

test('Stop falls back to Runtime cancel without Platform, counts 404 as confirmed and reports a refused revoke', async () => {
  let revoke = { status: 404 };
  let held = true;
  const { w, requests } = watcher((r) => {
    if (r.path === '/interactions/grants') return { status: 200, body: held ? GRANTED : { version: 1, sessions: [] } };
    if (r.method === 'DELETE') { if (revoke.status === 404) held = false; return revoke; }
    if (r.path === '/api/internal/provider-grants/host-cancel') return new Error('platform down');
    return { status: 200, body: {} };
  });
  await w.poll();
  assert.equal(await w.stop(), true, 'a session Runtime no longer has holds no grant');
  assert.ok(requests.some((r) => r.method === 'POST' && r.path === '/sessions/session-1/cancel'), 'Runtime cancels instead');
  held = true; revoke = { status: 500 };
  await w.poll();
  assert.equal(await w.stop(), false, 'an unconfirmed revoke is a failed Stop');
  assert.equal(w.current().holders.length, 1);
});

test('the notice says what is allowed, never takes focus, sits above desktop control and only Stops', () => {
  const state = { holders: [{ sessionId: 's', categories: ['computer_use'] }], unconfirmed: false };
  assert.match(standingGrantsNoticeText(state, { hotkey: true }, 'en-US').stop, /Ctrl\+Alt\+Shift\+D/u);
  assert.doesNotMatch(standingGrantsNoticeText(state, { hotkey: false }, 'en-US').stop, /Ctrl/u, 'no chord it does not hold');
  assert.match(standingGrantsNoticeText({ ...state, unconfirmed: true }, { hotkey: true }, 'zh-TW').message, /無法確認/u);
  assert.match(standingGrantsNoticeText(state, { hotkey: true, stopFailed: true }, 'en-US').message, /not confirmed/u);
  const html = buildStandingGrantsNoticeHtml(state, { hotkey: true }, 'en-US');
  assert.doesNotMatch(html, /<script/iu);
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.ok(standingGrantsNoticeBounds(area).y + standingGrantsNoticeBounds(area).height <= desktopControlNoticeBounds(area).y);

  const created = [];
  let stops = 0;
  const notice = createStandingGrantsNotice({
    createWindow(options) {
      const window = new EventEmitter();
      const contents = new EventEmitter();
      Object.assign(window, { options, visible: false, loads: [], destroyed: false,
        webContents: Object.assign(contents, { setWindowOpenHandler() {} }),
        isDestroyed: () => window.destroyed, isVisible: () => window.visible, setAlwaysOnTop(_on, level) { window.level = level; },
        setBounds() {}, loadURL(url) { window.loads.push(url); return Promise.resolve(); },
        showInactive() { window.visible = true; }, show() { throw new Error('never activates'); },
        hide() { window.visible = false; }, destroy() { window.destroyed = true; } });
      created.push(window);
      return window;
    },
    workArea: () => area, locale: () => 'en-US', onStop: () => { stops += 1; },
  });
  notice.update(state, { hotkey: true });
  const [window] = created;
  assert.equal(window.options.focusable, false);
  assert.equal(window.options.webPreferences.javascript, false);
  assert.equal(window.visible, true);
  window.webContents.emit('will-navigate', { preventDefault() {} }, 'cats-stop:');
  assert.equal(stops, 1);
  notice.update({ holders: [], unconfirmed: false }, { hotkey: false, stopFailed: true });
  assert.equal(window.visible, true, 'a failed Stop stays in view');
  notice.update({ holders: [], unconfirmed: false }, { hotkey: false });
  assert.equal(window.visible, false);
});
