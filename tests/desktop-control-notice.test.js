import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildDesktopControlNoticeHtml,
  createDesktopControlHoldWatcher,
  createDesktopControlNotice,
  desktopControlNoticeBounds,
  desktopControlNoticeText,
} from '../build/desktop/desktopControlNotice.js';

const HOLD = [{ channelId: 'channel-1', app: '記事本' }];

function fakeFetch(answers) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ path: new URL(url).pathname, method: init.method, key: init.headers['x-cats-desktop-auth-key'] });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  };
  return { fetch, requests };
}

test('the hold watcher reports changes only, keeps state over one failed poll and stops with the host key', async () => {
  const { fetch, requests } = fakeFetch([
    { status: 200, body: { holding: HOLD } },
    { status: 200, body: { holding: HOLD } },
    new Error('restarting'),
    { status: 200, body: { holding: [] } },
  ]);
  const changes = [];
  const watcher = createDesktopControlHoldWatcher({ baseUrl: 'http://127.0.0.1:8181', key: 'k'.repeat(64), fetch,
    onChange: (holding) => changes.push(holding) });
  for (let i = 0; i < 3; i++) await watcher.poll();
  assert.deepEqual(changes, [HOLD], 'an unchanged state and a single failure publish nothing');
  await watcher.stop();
  assert.deepEqual(changes, [HOLD, []]);
  assert.deepEqual(requests.at(-1), { path: '/api/internal/desktop-control/host-stop', method: 'POST', key: 'k'.repeat(64) });
  assert.equal(requests[0].path, '/api/internal/desktop-control/host-state');

  const failing = fakeFetch([{ status: 200, body: { holding: HOLD } }, { status: 403, body: {} }, new Error('gone')]);
  const cleared = [];
  const second = createDesktopControlHoldWatcher({ baseUrl: 'http://127.0.0.1:8181', key: 'k', fetch: failing.fetch,
    onChange: (holding) => cleared.push(holding) });
  for (let i = 0; i < 3; i++) await second.poll();
  assert.deepEqual(cleared, [HOLD, []], 'two failed polls in a row clear the notice');
});

test('the notice names the app, escapes it, has no script and parks in the work area corner', () => {
  const html = buildDesktopControlNoticeHtml([{ channelId: 'c', app: '<b>Evil</b>' }], 'en-US');
  assert.match(html, /Cats is operating &#60;b&#62;Evil&#60;\/b&#62;/u);
  assert.match(html, /href="cats-stop:"/u);
  assert.equal(/<script/iu.test(html), false);
  assert.match(html, /default-src 'none'/u);
  assert.equal(desktopControlNoticeText(HOLD, 'zh-TW').trayStop, '停止桌面控制（記事本）');
  assert.deepEqual(desktopControlNoticeBounds({ x: 0, y: 0, width: 1920, height: 1040 }), { x: 1544, y: 972, width: 360, height: 52 });
});

test('the notice window never takes focus and its Stop link only calls the host', () => {
  const created = [];
  let stops = 0;
  const notice = createDesktopControlNotice({
    createWindow(options) {
      const window = new EventEmitter();
      const contents = new EventEmitter();
      Object.assign(window, { options, visible: false, loads: [], destroyed: false, contents,
        webContents: Object.assign(contents, { setWindowOpenHandler(handler) { window.openHandler = handler; } }),
        isDestroyed: () => window.destroyed, isVisible: () => window.visible, setAlwaysOnTop(_on, level) { window.level = level; },
        setBounds(bounds) { window.bounds = bounds; }, loadURL(url) { window.loads.push(url); return Promise.resolve(); },
        showInactive() { window.visible = true; }, show() { throw new Error('the notice must never activate'); },
        hide() { window.visible = false; }, destroy() { window.destroyed = true; } });
      created.push(window);
      return window;
    },
    workArea: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
    locale: () => 'en-US',
    onStop: () => { stops += 1; },
  });
  notice.update(HOLD);
  notice.update(HOLD);
  const [window] = created;
  assert.equal(created.length, 1);
  assert.equal(window.options.focusable, false);
  assert.equal(window.options.webPreferences.javascript, false);
  assert.equal(window.level, 'screen-saver');
  assert.equal(window.visible, true);
  assert.equal(window.loads.length, 1, 'unchanged content is not reloaded');
  assert.deepEqual(window.openHandler(), { action: 'deny' });

  let prevented = 0;
  window.webContents.emit('will-navigate', { preventDefault: () => { prevented += 1; } }, 'https://example.com/');
  assert.equal(stops, 0);
  window.webContents.emit('will-navigate', { preventDefault: () => { prevented += 1; } }, 'cats-stop:');
  assert.equal(stops, 1);
  assert.equal(prevented, 2, 'the notice never navigates');

  notice.update([]);
  assert.equal(window.visible, false);
  notice.dispose();
  assert.equal(window.destroyed, true);
});
