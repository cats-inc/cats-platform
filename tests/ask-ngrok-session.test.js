import test from 'node:test';
import assert from 'node:assert/strict';
import { startSession } from '../scripts/testing/ask-ngrok-session.mjs';

const token = 'fixture-only-ngrok-token-12345';
const initial = () => ({ provider: 'ngrok', enabled: false, configured: false,
  configuredOrigin: '', listenPort: 0, target: null, legacySources: [] });
async function fixture(t, { listenerFails = false, ...options } = {}) {
  let settings = initial();
  const writes = [];
  let closed = 0;
  const session = await startSession({
    request: async (method, body) => {
      if (method === 'POST') {
        writes.push(body);
        settings = { ...settings, ...body, configured: !!body.publicOrigin,
          configuredOrigin: body.publicOrigin,
          target: body.enabled && !listenerFails ? `http://127.0.0.1:${body.listenPort}` : null };
      }
      return { status: 200, body: { remoteAccess: { ...settings } } };
    },
    forward: async config => {
      assert.equal(config.authtoken, token);
      assert.match(config.addr, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.equal(config.authtoken_from_env, false);
      return { url: () => 'https://fixture.example', close: async () => { closed++; } };
    },
    ...options,
  });
  t.after(() => session.dispose());
  const post = (route, value = {}, origin = new URL(session.controlUrl).origin) => fetch(`${session.controlUrl}/${route}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value),
  });
  return { session, post, writes, closed: () => closed,
    change: value => { settings = { ...settings, ...value }; } };
}

test('session uses the shared ingress, never persists the token, and restores only its own settings', async t => {
  const f = await fixture(t);
  const page = await fetch(f.session.controlUrl);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /type="password"/);
  const connected = await (await f.post('connect', { authtoken: token })).json();
  assert.equal(connected.state, 'provider_connected');
  assert.equal(connected.mcpUrl, 'https://fixture.example/apps/cats.ask/mcp');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].provider, 'external');
  assert.equal(JSON.stringify(f.writes).includes(token), false);
  assert.equal(JSON.stringify(connected).includes(token), false);
  await f.post('stop');
  assert.equal(f.closed(), 1);
  assert.deepEqual(f.writes[1], { enabled: false, provider: 'ngrok', listenPort: 0, publicOrigin: '' });
});

test('foreign origins, invalid token bodies and unexpected routes cannot change Desktop settings', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('connect', { authtoken: token }, 'https://attacker.example')).status, 403);
  assert.equal((await f.post('connect', { authtoken: 'short' })).status, 400);
  assert.equal((await f.post('unknown')).status, 403);
  assert.equal((await f.post('connect', { authtoken: token.repeat(50) })).status, 413);
  assert.equal(f.writes.length, 0);
});

test('existing remote settings are rejected; later user edits are preserved during stop', async t => {
  await assert.rejects(startSession({ request: async () => ({ status: 200, body: {
    remoteAccess: { ...initial(), configured: true },
  } }) }), /preserved/);
  const f = await fixture(t);
  await f.post('connect', { authtoken: token });
  f.change({ configuredOrigin: 'https://user.example', target: 'http://127.0.0.1:4242' });
  await f.post('stop');
  assert.equal(f.writes.length, 1);
  assert.equal(f.closed(), 1);
});

test('native errors do not disclose the token; timed-out native connections are closed when they arrive', async t => {
  const failed = await fixture(t, { forward: async () => { throw new Error(`Rejected ${token}`); } });
  const response = await failed.post('connect', { authtoken: token });
  const text = await response.text();
  assert.equal(text.includes(token), false);
  assert.equal(JSON.parse(text).state, 'connection_failed');
  assert.equal(failed.writes.length, 0);
  let complete;
  let closed = false;
  const timed = await fixture(t, { connectionTimeoutMs: 10, forward: () => new Promise(resolve => { complete = resolve; }) });
  assert.equal((await (await timed.post('connect', { authtoken: token })).json()).state, 'connection_failed');
  complete({ close: async () => { closed = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
  assert.equal(timed.writes.length, 0);
});

test('a late native listener keeps its port reserved until failed cleanup is retried', async t => {
  let complete;
  let address;
  let closes = 0;
  const f = await fixture(t, { connectionTimeoutMs: 10, cleanupTimeoutMs: 10,
    forward: config => { address = config.addr; return new Promise(resolve => { complete = resolve; }); } });
  const timed = await (await f.post('connect', { authtoken: token })).json();
  assert.equal(timed.cleanupPending, true);
  complete({ close: () => ++closes === 1 ? new Promise(() => {}) : Promise.resolve() });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(f.session.snapshot().state, 'cleanup_pending');
  assert.equal((await fetch(address)).status, 503);
  const stopped = await (await f.post('stop')).json();
  assert.equal(stopped.cleanupPending, false);
  assert.equal(stopped.state, 'stopped');
  assert.equal(closes, 2);
  await assert.rejects(fetch(address));
  assert.equal(f.writes.length, 0);
});

test('persisted configuration is restored when Desktop cannot bind its listener', async t => {
  const f = await fixture(t, { listenerFails: true });
  const status = await (await f.post('connect', { authtoken: token })).json();
  assert.equal(status.state, 'connection_failed');
  assert.equal(f.writes.length, 2);
  assert.equal(f.writes[1].enabled, false);
  assert.equal(f.closed(), 1);
  assert.equal(status.cleanupPending, false);
});

for (const hung of [false, true]) {
  test(`Cats admission is revoked before ${hung ? 'hung' : 'rejected'} native close, and cleanup can be retried`, async t => {
    let closes = 0;
    const f = await fixture(t, { cleanupTimeoutMs: 10, forward: async () => ({
      url: () => 'https://fixture.example', close: () => {
        closes++;
        if (closes > 1) return Promise.resolve();
        return hung ? new Promise(() => {}) : Promise.reject(new Error('native_failure'));
      },
    }) });
    await f.post('connect', { authtoken: token });
    const status = await (await f.post('stop')).json();
    assert.equal(f.writes[1].enabled, false);
    assert.equal(status.state, 'cleanup_pending');
    const retried = await (await f.post('stop')).json();
    assert.equal(retried.state, 'stopped');
    assert.equal(retried.cleanupPending, false);
  });
}
