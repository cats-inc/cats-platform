import { resetTestDom } from './helpers/installDomBeforeReact.ts';

import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
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
  await act(async () => releaseOld(new Response(JSON.stringify({ version: '0.0.0' }))));
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
