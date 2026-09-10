import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { setImmediate as nextTask } from 'node:timers/promises';
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { AppRendererSurface, APP_RENDERER_STARTUP_TIMEOUT_MS } from '../src/app/renderer/AppRendererSurface.tsx';

function setup(t: TestContext) {
  resetTestDom();
  document.documentElement.dataset.theme = 'light';
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let deadline: (() => void) | null = null;
  const timer = { unref() {} } as NodeJS.Timeout;
  globalThis.setTimeout = ((callback: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === APP_RENDERER_STARTUP_TIMEOUT_MS) { deadline = callback; return timer; }
    return originalTimeout(callback, ms, ...args);
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    if (id === timer) deadline = null;
    else originalClearTimeout(id);
  }) as typeof clearTimeout;
  t.after(() => {
    cleanup(); resetTestDom(); delete document.documentElement.dataset.theme;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });
  return { expire: () => { assert.ok(deadline); act(() => deadline?.()); }, hasDeadline: () => deadline !== null };
}

const surface = () => <AppRendererSurface appId="cats.usage" version="0.1.0" title="Usage" locale="zh-TW" onLobby={() => {}} />;
const payload = () => new Response(JSON.stringify({ html: '<html><head></head><body>Usage</body></html>', sdk: '', version: '0.1.0' }));

test('iframe quota bridge forwards each supported provider unchanged and rejects unsupported targets', async (t) => {
  setup(t);
  const originalChannel = globalThis.MessageChannel;
  const port = { onmessage: null as ((event: { data: unknown }) => Promise<void>) | null,
    start() {}, close() {}, postMessage(value: { ok: boolean }) { replies.push(value); } };
  const replies: Array<{ ok: boolean }> = [];
  globalThis.MessageChannel = class { port1 = port; port2 = {}; } as unknown as typeof MessageChannel;
  t.after(() => { globalThis.MessageChannel = originalChannel; });
  let time = Date.now(); t.mock.method(Date, 'now', () => time);
  const requests: Array<{ provider: string; instance: string }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url.includes('/renderer?')) return payload();
    assert.equal(url, '/api/apps/cats.usage/usage/refresh?version=0.1.0');
    assert.equal(init?.method, 'POST'); requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ status: 'updated' }));
  }) as typeof fetch;
  const view = render(surface());
  const iframe = await waitFor(() => view.getByTitle('Usage') as HTMLIFrameElement);
  const boot = JSON.parse(/globalThis\.__CATS_APP_BOOT__=(.*?);/u.exec(iframe.srcdoc)![1]!);
  t.mock.method(iframe.contentWindow!, 'postMessage', () => {});
  window.dispatchEvent(new window.MessageEvent('message', {
    origin: 'null', source: iframe.contentWindow, data: { type: 'cats.app.ready', nonce: boot.nonce },
  }));
  assert.ok(port.onmessage);
  for (const [index, provider] of ['codex', 'copilot', 'claude', 'antigravity'].entries()) {
    time += 1100;
    await port.onmessage({ data: { id: index + 1, method: 'usage.refreshQuota', params: { provider, instance: 'default' } } });
    assert.deepEqual(requests.at(-1), { provider, instance: 'default' });
    assert.equal(replies.at(-1)?.ok, true);
  }
  await port.onmessage({ data: { id: 5, method: 'usage.refreshQuota', params: { provider: 'kiro', instance: 'default' } } });
  assert.equal(replies.at(-1)?.ok, false); assert.equal(requests.length, 4);
});

test('stalled renderer request times out, aborts and can be retried without reinstallation', async (t) => {
  const clock = setup(t);
  let oldSignal: AbortSignal | null | undefined;
  let releaseOld!: (response: Response) => void;
  globalThis.fetch = ((_input, init) => {
    oldSignal = init?.signal;
    return new Promise<Response>((resolve) => { releaseOld = resolve; });
  }) as typeof fetch;
  const view = render(surface());
  assert.match(view.getByRole('status').textContent!, /載入 Usage/);
  clock.expire();
  assert.match(view.getByRole('alert').textContent!, /載入逾時/);
  assert.equal(oldSignal?.aborted, true);
  globalThis.fetch = async () => payload();
  fireEvent.click(view.getByRole('button', { name: '重新載入' }));
  await waitFor(() => view.getByTitle('Usage'));
  // A late stale attempt must not replace the new attempt with an access error.
  releaseOld(new Response(JSON.stringify({ version: '0.0.0' })));
  // This disposed response must not update React. Drain its microtasks without
  // async act(): esbuild's ESM bundle makes React's Node scheduler fall back to
  // a referenced MessageChannel, preventing the no-isolation suite from exiting.
  await nextTask();
  assert.equal(view.queryByRole('alert'), null);
  assert.ok(view.getByTitle('Usage'));
});

test('missing iframe SDK handshake times out and removes the blank frame', async (t) => {
  const clock = setup(t);
  globalThis.fetch = async () => payload();
  const view = render(surface());
  await waitFor(() => view.getByTitle('Usage'));
  clock.expire();
  assert.match(view.getByRole('alert').textContent!, /載入逾時/);
  assert.equal(view.queryByTitle('Usage'), null);
});

test('renderer access denials report an access change rather than loading forever', async (t) => {
  setup(t);
  for (const status of [401, 403, 409]) {
    globalThis.fetch = async () => new Response('{}', { status });
    const view = render(surface());
    await waitFor(() => assert.match(view.getByRole('alert').textContent!, /存取權或版本已變更/));
    view.unmount();
  }
});

test('nonce initialization failure is contained and unmount clears the loading deadline', async (t) => {
  const clock = setup(t);
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')!;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues() { throw new Error('Unavailable'); } } });
  t.after(() => Object.defineProperty(globalThis, 'crypto', originalCrypto));
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return payload(); };
  const failed = render(surface());
  await waitFor(() => failed.getByRole('alert'));
  assert.equal(fetched, false);
  assert.equal(clock.hasDeadline(), false);
  failed.unmount();
  Object.defineProperty(globalThis, 'crypto', originalCrypto);
  globalThis.fetch = () => new Promise(() => {});
  const loading = render(surface());
  assert.equal(clock.hasDeadline(), true);
  loading.unmount();
  assert.equal(clock.hasDeadline(), false);
});
