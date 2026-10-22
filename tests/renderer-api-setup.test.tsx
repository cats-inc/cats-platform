import assert from 'node:assert/strict';
import test from 'node:test';

import { createSetupApi } from '../src/products/shared/renderer/api/setup.ts';

test('createSetupApi.resetSetup posts to the reset endpoint and preserves expectJson errors', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ error: { message: 'setup reset denied' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    };

    const setupApi = createSetupApi((payload: { ok: boolean }) => payload);
    const signal = new AbortController().signal;

    await assert.rejects(
      () => setupApi.resetSetup(signal),
      /setup reset denied/u,
    );
    assert.equal(calls[0]?.url, '/api/setup/reset');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, {
      Accept: 'application/json',
    });
    assert.equal(calls[0]?.init?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createSetupApi.resetSetup clears browser storage only after the server confirms the reset', async () => {
  const originalFetch = globalThis.fetch;
  const globals = globalThis as { window?: unknown };
  const originalWindow = globals.window;
  let cleared = 0;
  globals.window = { localStorage: { clear: () => { cleared += 1; } } };
  let status = 500;
  globalThis.fetch = async () => new Response(JSON.stringify(status === 200
    ? { ok: true }
    : { error: { message: 'reset incomplete' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

  try {
    const setupApi = createSetupApi((payload: { ok: boolean }) => payload);
    await assert.rejects(() => setupApi.resetSetup(), /reset incomplete/u);
    assert.equal(cleared, 0);

    status = 200;
    assert.deepEqual(await setupApi.resetSetup(), { ok: true });
    assert.equal(cleared, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globals.window = originalWindow;
  }
});
