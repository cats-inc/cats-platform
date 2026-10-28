import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createDesktopControlService, DESKTOP_CONTROL_MCP_PATH } from '../build/server/platform/desktopControl/service.js';
import { createDesktopControlHelperClient } from '../build/server/platform/desktopControl/helper.js';
import { evaluateDesktopControlPolicy } from '../build/server/platform/desktopControl/policy.js';
import { resolveDesktopControlTurn } from '../build/server/platform/desktopControl/server.js';
import { isLocalOwnerRequest } from '../build/server/platform/desktopControl/routes.js';
import { isInternalPlatformRoute } from '../build/server/platform/apps/ingressBoundary.js';

const NOTEPAD = 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsNotepad\\Notepad\\Notepad.exe';

function snapshot({ approval = 'on-request', status = 'verified', source = 'explicit', host = true } = {}) {
  return { version: 1, sessionId: 's', workerGeneration: null, supported: true, observation: {
    interactions: { version: 1, supported: ['tool_approval'], ...(host ? { host: { version: 1, kinds: ['tool_approval'], timeoutMs: 1 } } : {}) },
    policy: { source, status, coverage: 'local-process-only', configurationSources: [],
      requested: source === 'explicit' ? { version: 1, mode: 'explicit', access: 'full-access', network: true, approval } : undefined },
    inventory: { state: 'observed', observedAt: null, stale: false, coverage: 'top-level-mcp', pages: 1, servers: [], dynamicTools: [], builtins: 'observed' },
    dependencies: [] } };
}

/** A fake helper: answers protocol 1 requests from a script; `windows` and `locked` are mutable. */
function fakeHelper(world) {
  const calls = [];
  const spawn = () => {
    const stdout = new PassThrough();
    const process = new EventEmitter();
    process.stdout = stdout;
    process.kill = () => { process.emit('exit', 0); return true; };
    process.stdin = { end() {}, write(line) {
      const { id, op, params } = JSON.parse(line);
      calls.push(op);
      const reply = (result) => stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`);
      const fail = (code) => stdout.write(`${JSON.stringify({ id, ok: false, error: { code, message: code } })}\n`);
      if (world.crashOn === op) { process.emit('exit', 1); return true; }
      if (op === 'hello') reply({ protocol: world.protocol ?? 1, version: '1.0.0', platform: 'win32', dpiAwareness: 'per_monitor_v2' });
      else if (op === 'state') reply({ locked: world.locked === true, idleMs: 9000 });
      else if (op === 'resolve_apps') reply({ matches: params.queries.map((query) => ({ query, candidates: world.apps[query] ?? [] })) });
      else if (op === 'list_windows') reply({ windows: world.windows.filter((w) => params.paths.includes(w.path)) });
      else if (op === 'capture_window') reply({ pngBase64: 'iVBORw0KGgo=', width: 100, height: 50, scale: 0.5, bounds: {} });
      else if (op === 'read_ui') reply({ nodes: [{ elementId: 'e0', parentId: null, role: 'window', name: 'Notepad', value: null },
        { elementId: 'e1', parentId: 'e0', role: 'edit', name: 'Text', value: 'hello' }], truncated: false });
      else if (op === 'open_app') reply({ pid: 42 });
      else fail('invalid_request');
      return true;
    } };
    return process;
  };
  return { calls, spawn };
}

async function fixture(t, overrides = {}) {
  const world = { apps: { 記事本: [{ path: NOTEPAD, publisher: 'Microsoft Corporation', productName: 'Notepad',
    displayName: '記事本', running: true, category: 'normal', aumid: 'Microsoft.WindowsNotepad!App' }],
  powershell: [{ path: 'C:\\Windows\\powershell.exe', publisher: 'Microsoft Windows', productName: 'PowerShell',
    displayName: 'Windows PowerShell', running: true, category: 'observe_only', aumid: null }],
  cats: [{ path: 'C:\\Cats\\Cats.exe', publisher: null, productName: 'Cats', displayName: 'Cats', running: true,
    category: 'excluded', aumid: null }] },
  windows: [{ hwnd: 7, pid: 1, path: NOTEPAD, title: 'Untitled - Notepad', bounds: { x: 0, y: 0, width: 800, height: 600 },
    minimized: false, foreground: true }], ...overrides.world };
  const helperFake = fakeHelper(world);
  const settings = { enabled: true, conversations: ['channel-1'], ...overrides.settings };
  let endpoint;
  const service = createDesktopControlService({
    helper: overrides.helper === null ? null : createDesktopControlHelperClient({ path: 'fake.exe', selfProcessIds: [1],
      selfExecutables: [], spawn: helperFake.spawn }),
    unavailableReason: overrides.helper === null ? 'not_windows' : null,
    endpoint: () => endpoint,
    readSettings: async () => ({ ...settings, conversations: [...settings.conversations] }),
    writeSettings: async (next) => { Object.assign(settings, next); },
    resolveTurn: async (_sessionId, input) => input.context?.metadata?.channelId
      ? { channelId: input.context.metadata.channelId, ownerPresent: input.context.metadata.owner === true } : null,
    capabilities: async () => overrides.snapshot ?? snapshot(),
    grantWaitMs: 300,
  });
  const server = createServer((req, res) => { void service.route(req, res).then((handled) => { if (!handled) res.writeHead(404).end(); }); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}${DESKTOP_CONTROL_MCP_PATH}`;
  t.after(async () => { service.close(); await new Promise((resolve) => server.close(resolve)); });
  const sent = [];
  const turns = [];
  const client = service.wrapClient({
    async sendMessage(sessionId, content, input) {
      sent.push(input);
      const server = input.mcpServers?.find((row) => row.name === 'cats-desktop');
      for (const turn of turns.splice(0)) await turn(server?.auth.token);
      return { segments: [] };
    },
    async closeSession() {},
  });
  const call = async (token, name, args = {}) => (await (await fetch(endpoint, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
  const send = (meta, during) => { if (during) turns.push(during); return client.sendMessage('session-1', 'hi', { context: { metadata: meta } }); };
  return { service, settings, world, helperFake, sent, call, send };
}

test('DC-04 policy gate passes only explicit interactive approval and fails closed', () => {
  assert.deepEqual(evaluateDesktopControlPolicy(snapshot()), { ok: true });
  assert.deepEqual(evaluateDesktopControlPolicy(snapshot({ approval: 'untrusted', status: 'not_observed' })), { ok: true });
  assert.equal(evaluateDesktopControlPolicy(snapshot({ approval: 'never' })).reason, 'policy_preapproves_tools');
  assert.equal(evaluateDesktopControlPolicy(snapshot({ status: 'mismatch' })).reason, 'policy_mismatch');
  assert.equal(evaluateDesktopControlPolicy(snapshot({ source: 'provider' })).reason, 'policy_not_explicit');
  assert.equal(evaluateDesktopControlPolicy(snapshot({ host: false })).reason, 'no_tool_approval_host');
  assert.equal(evaluateDesktopControlPolicy(null).reason, 'policy_unknown');
  assert.equal(evaluateDesktopControlPolicy({ supported: false }).reason, 'policy_unknown');
});

test('DC-05 only a stamped local owner message makes a turn owner-present', async () => {
  const store = { read: async () => ({ channels: [{ id: 'channel-1', messages: [
    { id: 'm-local', senderKind: 'user', metadata: { desktopControlEntry: 'local' } },
    { id: 'm-telegram', senderKind: 'user', metadata: { transport: 'telegram' } },
    { id: 'm-cat', senderKind: 'cat', metadata: { desktopControlEntry: 'local' } }] }] }) };
  const turn = (meta) => resolveDesktopControlTurn(store, { context: { metadata: { supervisionProduct: 'cats-chat',
    supervisionRunId: 'chat:channel-1', supervisionSurface: 'runtime-dispatch', ...meta } } });
  assert.deepEqual(await turn({ sourceMessageId: 'm-local' }), { channelId: 'channel-1', ownerPresent: true });
  assert.equal((await turn({ sourceMessageId: 'm-telegram' })).ownerPresent, false);
  assert.equal((await turn({ sourceMessageId: 'm-cat' })).ownerPresent, false);
  assert.equal((await turn({ sourceMessageId: 'm-local', supervisionSurface: 'companion-heartbeat' })).ownerPresent, false);
  assert.equal(await turn({ supervisionRunId: 'other' }), null);
  assert.equal(await resolveDesktopControlTurn(store, { context: { metadata: { supervisionProduct: 'cats-work' } } }), null);
});

test('local owner requests need loopback, no forwarding and a browser cookie owner', () => {
  const owner = { credentialKind: 'browser_cookie', principal: { membership: { roles: ['owner'] } } };
  const request = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });
  const url = new URL('http://127.0.0.1:8181/api/desktop-control/state');
  assert.equal(isLocalOwnerRequest({ request: request('::ffff:127.0.0.1'), url, auth: owner }), true);
  assert.equal(isLocalOwnerRequest({ request: request('127.0.0.1', { 'x-forwarded-for': '1.2.3.4' }), url, auth: owner }), false);
  assert.equal(isLocalOwnerRequest({ request: request('192.168.1.5'), url, auth: owner }), false);
  assert.equal(isLocalOwnerRequest({ request: request('127.0.0.1'), url, auth: { ...owner, credentialKind: 'bearer' } }), false);
  assert.equal(isLocalOwnerRequest({ request: request('127.0.0.1'), url: new URL('http://cats.example/x'), auth: owner }), false);
  assert.equal(isInternalPlatformRoute('/api/internal/desktop-control/mcp', 'POST'), true);
  assert.equal(isInternalPlatformRoute('/api/desktop-control/state', 'GET'), true);
});

test('the descriptor rides only qualifying sends and tools serve only owner-present turns', async (t) => {
  const f = await fixture(t);
  let token;
  await f.send({ channelId: 'channel-1', owner: false }, async (issued) => {
    token = issued;
    const result = await f.call(issued, 'list_windows');
    assert.equal(result.structuredContent.error.code, 'not_owner_present');
  });
  assert.ok(token, 'a qualifying conversation carries the cats-desktop descriptor');
  assert.match(f.sent[0].instructions, /cats-desktop/);

  f.settings.conversations = [];
  await f.send({ channelId: 'channel-1', owner: true });
  assert.deepEqual(f.sent[1].mcpServers, [], 'turning the conversation off drops the descriptor Runtime holds');
  assert.equal((await f.service.state('channel-1')).conversation.reason, 'conversation_off');

  await f.send({ channelId: 'channel-2', owner: true });
  assert.equal(f.sent[2].mcpServers, undefined);
});

test('a session whose policy pre-approves tools is never injected', async (t) => {
  const f = await fixture(t, { snapshot: snapshot({ approval: 'never' }) });
  await f.send({ channelId: 'channel-1', owner: true });
  assert.equal(f.sent[0].mcpServers, undefined);
  const state = await f.service.state('channel-1');
  assert.equal(state.conversation.status, 'not_injected');
  assert.equal(state.conversation.reason, 'policy_preapproves_tools');
});

test('only the owner grants apps; then list, screenshot, read and open work', async (t) => {
  const f = await fixture(t);
  await f.send({ channelId: 'channel-1', owner: true }, async (token) => {
    // No answer within the wait: the request stays open for the owner.
    const waited = await f.call(token, 'request_app_access', { apps: ['記事本'], reason: 'Check the note' });
    assert.equal(waited.structuredContent.results[0].status, 'pending');
  });
  await f.send({ channelId: 'channel-1', owner: true }, async (token) => {
    const pending = f.call(token, 'request_app_access', { apps: ['記事本', 'cats', 'nothing'], reason: 'Check the note' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const open = (await f.service.state('channel-1')).conversation.pendingRequests;
    assert.equal(open.length, 1, 'asking again joins the open request');
    const request = open[0];
    assert.equal(request.name, '記事本');
    assert.equal(f.service.decideGrant(request.requestId, 'allow', 'other-channel'), false, 'another conversation cannot answer');
    assert.equal(f.service.decideGrant(request.requestId, 'allow', 'channel-1'), true);
    const granted = (await pending).structuredContent.results;
    assert.deepEqual(granted.map((row) => row.status), ['granted', 'excluded', 'not_found']);
    const appId = granted[0].app.appId;

    const listed = (await f.call(token, 'list_windows')).structuredContent.windows;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].appId, appId);
    const shot = await f.call(token, 'screenshot_window', { windowId: listed[0].windowId, maxEdge: 512 });
    assert.equal(shot.content[0].type, 'image');
    assert.match(shot.structuredContent.snapshotId, /^snap_/);
    const ui = (await f.call(token, 'read_ui', { windowId: listed[0].windowId })).structuredContent;
    assert.deepEqual(ui.nodes.map((node) => node.elementId), ['ui1.e0', 'ui1.e1']);
    assert.equal(ui.nodes[1].parentId, 'ui1.e0');
    assert.equal((await f.call(token, 'open_app', { appId })).structuredContent.opened, true);
    assert.equal((await f.call(token, 'open_app', { appId: 'app_unknown' })).structuredContent.error.code, 'not_granted');
    assert.equal((await f.call(token, 'read_ui', { windowId: 'win_unknown' })).structuredContent.error.code, 'window_changed');
    assert.equal((await f.call(token, 'list_windows', { extra: 1 })).structuredContent.error.code, 'unavailable');

    f.world.windows = [];
    assert.equal((await f.call(token, 'screenshot_window', { windowId: listed[0].windowId })).structuredContent.error.code,
      'window_changed', 'a closed or ungranted window is refused');

    const state = await f.service.state('channel-1');
    assert.equal(state.conversation.status, 'active_turn');
    assert.equal(state.conversation.grants[0].name, '記事本');
    assert.equal(JSON.stringify(state).includes('iVBOR'), false, 'state never carries screenshot bytes');

    f.service.stop('channel-1');
    assert.equal((await f.call(token, 'list_windows')).structuredContent.error.code, 'stopped');
    assert.equal((await f.service.state('channel-1')).conversation.grants.length, 0);

    f.world.locked = true;
    assert.equal((await f.call(token, 'request_app_access', { apps: ['記事本'], reason: 'again' })).structuredContent.error.code, 'locked');
  });
});

test('turning the feature off revokes credentials and the helper never runs on other platforms', async (t) => {
  const f = await fixture(t);
  let token;
  await f.send({ channelId: 'channel-1', owner: true }, async (issued) => { token = issued; });
  await f.service.setEnabled(false);
  const refused = await fetch(f.sent[0].mcpServers[0].url, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(refused.status, 401);

  const off = await fixture(t, { helper: null });
  await off.send({ channelId: 'channel-1', owner: true });
  assert.equal(off.sent[0].mcpServers, undefined);
  const state = await off.service.state('channel-1');
  assert.equal(state.available, false);
  assert.equal(state.conversation.status, 'unavailable');
  assert.equal(state.reason, 'not_windows');
});

test('the helper client restarts after a crash and stops after repeated crashes', async () => {
  const world = { apps: {}, windows: [], crashOn: 'list_windows' };
  const helperFake = fakeHelper(world);
  const client = createDesktopControlHelperClient({ path: 'fake.exe', selfProcessIds: [], selfExecutables: [], spawn: helperFake.spawn });
  for (let i = 0; i < 4; i++) {
    await assert.rejects(client.call('list_windows', { paths: [] }), (error) => error.code === 'executor_failed');
  }
  assert.equal(client.unavailableReason(), 'helper_crashed');
  await assert.rejects(client.call('state'), (error) => error.code === 'unavailable');
  assert.equal(helperFake.calls.filter((op) => op === 'hello').length, 4, 'each call after a crash starts a new helper');
  client.reset();
  assert.equal(client.unavailableReason(), null, 'turning the feature off and on clears the crash history');

  const mismatched = createDesktopControlHelperClient({ path: 'fake.exe', selfProcessIds: [], selfExecutables: [],
    spawn: fakeHelper({ protocol: 2, apps: {}, windows: [] }).spawn });
  await assert.rejects(mismatched.call('state'), (error) => error.code === 'unavailable');
  client.close();
});
