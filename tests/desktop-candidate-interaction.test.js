import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createDesktopCandidateInteraction } from '../build/desktop/candidateInteraction.js';

function fixture() {
  const state = { url: 'http://127.0.0.1:43210/chat', zoom: 1, width: 800, height: 600,
    editable: true, stopping: false, loading: false, destroyed: false, devtools: false, now: 0 };
  const commands = [];
  const debugger_ = Object.assign(new EventEmitter(), { attached: false, detaches: 0,
    isAttached() { return this.attached; },
    attach() { this.attached = true; },
    detach() { this.detaches += 1; this.attached = false; this.emit('detach'); },
    async sendCommand(method, parameters) { commands.push({ method, ...parameters }); },
  });
  const png = Buffer.alloc(24);
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(1200, 20);
  const contents = Object.assign(new EventEmitter(), {
    debugger: debugger_, isDestroyed: () => state.destroyed, isLoading: () => state.loading,
    getURL: () => state.url, getZoomFactor: () => state.zoom, isDevToolsOpened: () => state.devtools,
    executeJavaScript: async () => ({ width: state.width, height: state.height, editable: state.editable }),
    capturePage: async () => ({ toPNG: () => png }),
  });
  const window = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => state.destroyed });
  const interaction = createDesktopCandidateInteraction(window, {
    allowedUrl: (url) => url.startsWith('http://127.0.0.1:43210/'), stopping: () => state.stopping,
    now: () => state.now,
  });
  const act = async (action) => interaction.input({ frameId: (await interaction.screenshot()).frameId, ...action });
  return { interaction, state, commands, debugger_, contents, window, act };
}

test('candidate input maps exact PNG pixels to CSS viewport and consumes every observation', async () => {
  const { interaction, commands, act } = fixture();
  const shot = await interaction.screenshot();
  assert.equal(shot.width, 1600);
  await interaction.input({ frameId: shot.frameId, kind: 'click', x: 800, y: 600 });
  assert.deepEqual(commands.map(({ type, x, y }) => ({ type, x, y })), [
    { type: 'mousePressed', x: 400, y: 300 }, { type: 'mouseReleased', x: 400, y: 300 },
  ]);
  await assert.rejects(interaction.input({ frameId: shot.frameId, kind: 'key', key: 'Enter' }), /observe again/u);
  await act({ kind: 'scroll', x: 1000, y: 1000, deltaY: 300 });
  assert.deepEqual(commands.at(-1), { method: 'Input.dispatchMouseEvent', type: 'mouseWheel',
    x: 500, y: 500, deltaX: 0, deltaY: 300 });
  await act({ kind: 'text', text: 'synthetic input', replace: true });
  assert.equal(commands.at(-1).method, 'Input.insertText');
  assert.equal(commands.at(-1).text, 'synthetic input');
  await act({ kind: 'text', text: '', replace: true });
  assert.equal(commands.at(-1).key, 'Backspace');
  await act({ kind: 'key', key: 'Tab' });
  assert.equal(commands.at(-1).type, 'keyUp');
  assert.equal(commands.at(-1).key, 'Tab');
  await act({ kind: 'key', key: 'Enter' });
  assert.equal(commands.at(-2).text, '\r', 'Enter needs its character event to insert a newline');
});

test('candidate frames expire on replacement, time, navigation, viewport, zoom and shutdown', async () => {
  for (const mutate of [
    async ({ interaction }) => { await interaction.screenshot(); },
    ({ state }) => { state.now = 120001; },
    ({ contents }) => { contents.emit('did-start-navigation'); },
    ({ window }) => { window.emit('resize'); },
    ({ state }) => { state.width = 799; },
    ({ state }) => { state.zoom = 2; },
    ({ state }) => { state.url = 'https://example.test/'; },
    ({ state }) => { state.stopping = true; },
    ({ state }) => { state.destroyed = true; },
    ({ state }) => { state.loading = true; },
  ]) {
    const f = fixture();
    const shot = await f.interaction.screenshot();
    await mutate(f);
    await assert.rejects(f.interaction.input({ kind: 'key', key: 'Enter', frameId: shot.frameId }));
    assert.equal(f.commands.length, 0);
  }
});

test('candidate rejects arbitrary methods, fields, coordinates, keys and text without echoing text', async () => {
  for (const action of [
    { kind: 'script', code: 'private sentinel' },
    { kind: 'key', key: 'F12' },
    { kind: 'key', key: 'Enter', extra: 'private sentinel' },
    { kind: 'click', x: 1600, y: 1 },
    { kind: 'click', x: -1, y: 1 },
    { kind: 'scroll', x: 1, y: 1, deltaY: 2001 },
    { kind: 'text', text: 'private sentinel'.repeat(300) },
    { kind: 'text', text: 'private sentinel', replace: 'yes' },
  ]) {
    const f = fixture();
    await assert.rejects(f.act(action), (error) => !error.message.includes('private sentinel'));
    assert.equal(f.commands.length, 0);
  }
  const f = fixture();
  f.state.editable = false;
  await assert.rejects(f.act({ kind: 'text', text: 'private sentinel' }), /focused editable/u);
  assert.equal(f.commands.length, 0);
});

test('candidate refuses concurrent capture/input and changes while awaiting the renderer', async () => {
  const f = fixture();
  let release;
  f.contents.capturePage = () => new Promise((resolve) => { release = resolve; });
  const pending = f.interaction.screenshot();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(f.interaction.screenshot(), /busy/u);
  await assert.rejects(f.interaction.input({}), /busy/u);
  f.window.emit('resize');
  release({ toPNG: () => Buffer.alloc(24) });
  await assert.rejects(pending, /changed while capturing/u);

  const g = fixture();
  const shot = await g.interaction.screenshot();
  g.contents.executeJavaScript = () => new Promise((resolve) => { release = resolve; });
  const input = g.interaction.input({ frameId: shot.frameId, kind: 'key', key: 'Enter' });
  await assert.rejects(g.interaction.input({ frameId: shot.frameId }), /busy/u);
  g.state.stopping = true;
  g.interaction.invalidate();
  release({ width: 800, height: 600, editable: true });
  await assert.rejects(input, /unavailable/u);
  assert.equal(g.commands.length, 0);
});

test('candidate does not take over another debugger or detach a replacement connection', async () => {
  for (const devtools of [false, true]) {
    const f = fixture();
    f.debugger_.attached = !devtools;
    f.state.devtools = devtools;
    await assert.rejects(f.act({ kind: 'key', key: 'Enter' }), /already in use/u);
    assert.equal(f.debugger_.detaches, 0);
    assert.equal(f.commands.length, 0);
  }
  const f = fixture();
  f.debugger_.sendCommand = async () => {
    f.debugger_.emit('detach'); // DevTools took over before the release.
    f.debugger_.attached = true;
  };
  await assert.rejects(f.act({ kind: 'click', x: 1, y: 1 }), /disconnected/u);
  assert.equal(f.debugger_.detaches, 0);
});

test('candidate releases pressed input if navigation interrupts it and can observe afterwards', async () => {
  for (const action of [{ kind: 'click', x: 1, y: 1 }, { kind: 'key', key: 'Enter' }]) {
    const f = fixture();
    f.debugger_.sendCommand = async (method, parameters) => {
      f.commands.push({ method, ...parameters });
      if (f.commands.length === 1) f.contents.emit('did-start-navigation');
    };
    await assert.rejects(f.act(action), /changed/u);
    assert.equal(f.commands.length, 2);
    assert.ok(['mouseReleased', 'keyUp'].includes(f.commands[1].type));
    assert.equal(f.debugger_.detaches, 1);
    await f.interaction.screenshot();
  }
});

test('candidate times out uncertain dispatch, releases it and never replays late completion', async () => {
  const f = fixture();
  let settle;
  f.debugger_.sendCommand = (method, parameters) => {
    f.commands.push({ method, ...parameters });
    if (f.commands.length === 1) return new Promise((resolve) => { settle = resolve; });
    return Promise.resolve();
  };
  const shot = await f.interaction.screenshot();
  await assert.rejects(f.interaction.input({ frameId: shot.frameId, kind: 'key', key: 'Enter' }), /timed out/u);
  assert.deepEqual(f.commands.map(({ type }) => type), ['keyDown', 'keyUp']);
  await assert.rejects(f.interaction.input({ frameId: shot.frameId, kind: 'key', key: 'Enter' }), /observe again/u);
  settle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.commands.length, 2);
  await f.interaction.screenshot();
});
