import assert from 'node:assert/strict';
import test from 'node:test';

import { createSetupApi } from '../src/products/shared/renderer/api/setup.ts';

test('createSetupApi.completeSetup posts setup input and normalizes the returned payload', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;
  const normalizeCalls: unknown[] = [];

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ownerDisplayName: 'KEN', stage: 'raw' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const setupApi = createSetupApi((payload: { ownerDisplayName: string; stage: string }) => {
      normalizeCalls.push(payload);
      return { ...payload, stage: 'normalized' };
    });
    const signal = new AbortController().signal;
    const payload = await setupApi.completeSetup({
      ownerDisplayName: 'Ken',
      bossCatName: 'Boss Cat',
      bossCatProvider: 'claude',
      bossCatInstance: 'native',
      bossCatModel: 'opus',
    }, signal);

    assert.deepEqual(payload, { ownerDisplayName: 'KEN', stage: 'normalized' });
    assert.deepEqual(normalizeCalls, [{ ownerDisplayName: 'KEN', stage: 'raw' }]);
    assert.equal(calls[0]?.url, '/api/setup/complete');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, {
      'content-type': 'application/json',
      Accept: 'application/json',
    });
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        ownerDisplayName: 'Ken',
        bossCatName: 'Boss Cat',
        bossCatProvider: 'claude',
        bossCatInstance: 'native',
        bossCatModel: 'opus',
      }),
    );
    assert.equal(calls[0]?.init?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
