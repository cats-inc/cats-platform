import assert from 'node:assert/strict';
import test from 'node:test';
import { DesktopPlatformShellReader, isDesktopPlatformSessionCookie } from '../build/desktop/platformShellReader.js';
import { buildDesktopTrayMenuState } from '../build/desktop/trayMenu.js';

const completed = '2026-09-24T00:00:00Z';
const fullShell = {
  setupCompleteAt: completed,
  products: ['chat', 'work', 'code'].map((id) => ({
    id, productName: `Cats ${id}`, routePrefix: `/${id}`,
    installState: 'installed', setup: { selectable: true },
  })),
};
const signedOut = { auth: { authenticated: false }, setup: { completeAt: completed } };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
function trayProducts(reader, fallbackSetupCompleteAt = completed) {
  const shell = reader.read();
  return buildDesktopTrayMenuState({
    phase: 'ready_for_chat', summary: 'Ready', actions: [],
    setupCompleteAt: shell?.setupCompleteAt ?? null,
    fallbackSetupCompleteAt,
    products: shell?.products,
  }).products.map((product) => product.id);
}

test('cold start and later refresh use the browser session to retain configured product shortcuts', async () => {
  const reader = new DesktopPlatformShellReader('http://127.0.0.1:8181', async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8181/api/app-shell');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    return response(init.credentials === 'include' ? fullShell : signedOut);
  });
  await reader.refresh();
  assert.deepEqual(trayProducts(reader), ['chat', 'work', 'code']);
  await reader.refresh();
  assert.deepEqual(trayProducts(reader), ['chat', 'work', 'code']);
});

test('logout clears shortcuts without losing setup, and login restores them', async () => {
  let authenticated = true;
  const reader = new DesktopPlatformShellReader('http://localhost:8181', async () =>
    response(authenticated ? fullShell : signedOut));
  await reader.refresh();
  authenticated = false;
  await reader.refresh();
  assert.equal(reader.read().setupCompleteAt, completed);
  assert.deepEqual(trayProducts(reader), []);
  authenticated = true;
  await reader.refresh();
  assert.deepEqual(trayProducts(reader), ['chat', 'work', 'code']);
});

test('a disabled product and an authoritative empty list remove existing shortcuts', async () => {
  let payload = fullShell;
  const reader = new DesktopPlatformShellReader('http://localhost:8181', async () => response(payload));
  await reader.refresh();
  payload = { ...fullShell, products: fullShell.products.map((product) => product.id === 'work'
    ? { ...product, setup: { selectable: false, disabledReason: 'Disabled' } } : product) };
  await reader.refresh();
  assert.deepEqual(trayProducts(reader), ['chat', 'code']);
  payload = { ...fullShell, products: [] };
  await reader.refresh();
  assert.deepEqual(trayProducts(reader), []);
});

test('transient errors and malformed payloads retain the last confirmed shell', async () => {
  let fetchResponse = async () => response(fullShell);
  const reader = new DesktopPlatformShellReader('http://localhost:8181', (...args) => fetchResponse(...args));
  await reader.refresh();
  for (const failed of [
    async () => { throw new Error('connection refused'); },
    async () => response({ error: 'unavailable' }, 503),
    async () => response({ setupCompleteAt: completed }),
    async () => response(null),
    async () => response({ auth: { authenticated: false } }),
  ]) {
    fetchResponse = failed;
    await assert.rejects(reader.refresh());
    assert.deepEqual(trayProducts(reader), ['chat', 'work', 'code']);
  }
});

test('stale requests cannot overwrite a newer login, logout or renderer product update', async () => {
  for (const newer of [fullShell, { setupCompleteAt: completed, products: [] }]) {
    let finishOld;
    let first = true;
    const reader = new DesktopPlatformShellReader('http://localhost:8181', async () => {
      if (first) { first = false; return new Promise((resolve) => { finishOld = resolve; }); }
      return response(newer);
    });
    const oldRequest = reader.refresh();
    await reader.refresh();
    const current = reader.read();
    finishOld(response(newer.products.length ? signedOut : fullShell));
    await oldRequest;
    assert.strictEqual(reader.read(), current);

    let finishRefresh;
    const rendererReader = new DesktopPlatformShellReader('http://localhost:8181', () =>
      new Promise((resolve) => { finishRefresh = resolve; }));
    const refresh = rendererReader.refresh();
    rendererReader.replace(newer);
    finishRefresh(response(signedOut));
    await refresh;
    assert.strictEqual(rendererReader.read(), newer);
  }
});

test('setup reset hides shortcuts instead of falling back to cached completion', async () => {
  const reader = new DesktopPlatformShellReader('http://localhost:8181', async () =>
    response({ ...fullShell, setupCompleteAt: null }));
  reader.replace(fullShell);
  await reader.refresh();
  assert.equal(reader.read().setupCompleteAt, null);
  assert.deepEqual(trayProducts(reader, null), []);
});

test('only the Platform session cookie on the configured host triggers a refresh', () => {
  assert.equal(isDesktopPlatformSessionCookie({ name: 'cats_session', domain: '127.0.0.1' }, 'http://127.0.0.1:8181'), true);
  assert.equal(isDesktopPlatformSessionCookie({ name: 'cats_session', domain: '.localhost' }, 'http://localhost:8181'), true);
  assert.equal(isDesktopPlatformSessionCookie({ name: 'other', domain: 'localhost' }, 'http://localhost:8181'), false);
  assert.equal(isDesktopPlatformSessionCookie({ name: 'cats_session', domain: 'elsewhere.test' }, 'http://localhost:8181'), false);
});
