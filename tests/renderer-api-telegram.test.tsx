import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramApi } from '../src/products/shared/renderer/api/telegram.ts';

test('createTelegramApi.createBotBindingApi posts a telegram mutation and refetches through the shared callback', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const refetchCalls: Array<{ response: Response; errorFallback: string; signal?: AbortSignal }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 202 });
    };

    const api = createTelegramApi({
      refetchAfterMutation: async (response, errorFallback, signal) => {
        refetchCalls.push({ response, errorFallback, signal });
        return { refreshed: true, status: response.status };
      },
    });
    const signal = new AbortController().signal;
    const payload = await api.createBotBindingApi({
      botName: 'BossCatBot',
      catId: 'cat-boss',
      inboundMode: 'polling',
      botToken: 'token-123',
    }, signal);

    assert.deepEqual(payload, { refreshed: true, status: 202 });
    assert.equal(calls[0]?.url, '/api/bot-bindings');
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, {
      'content-type': 'application/json',
      Accept: 'application/json',
    });
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        platform: 'telegram',
        botName: 'BossCatBot',
        catId: 'cat-boss',
        inboundMode: 'polling',
        botToken: 'token-123',
      }),
    );
    assert.equal(refetchCalls[0]?.errorFallback, 'bot binding create returned 202');
    assert.equal(refetchCalls[0]?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createTelegramApi.deleteBotBindingApi encodes the binding id before delegating to refetchAfterMutation', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    };

    const api = createTelegramApi({
      refetchAfterMutation: async () => ({ ok: true }),
    });

    const payload = await api.deleteBotBindingApi('binding/with spaces');

    assert.deepEqual(payload, { ok: true });
    assert.equal(calls[0]?.url, '/api/bot-bindings/binding%2Fwith%20spaces');
    assert.equal(calls[0]?.init?.method, 'DELETE');
    assert.deepEqual(calls[0]?.init?.headers, {
      Accept: 'application/json',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createTelegramApi.updateBotBindingApi patches the binding and returns the parsed response directly', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        status: 'active',
        updated: true,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const api = createTelegramApi({
      refetchAfterMutation: async () => {
        throw new Error('update should not refetch');
      },
    });

    const payload = await api.updateBotBindingApi('binding-1', {
      status: 'active',
      webhookSecret: null,
    });

    assert.deepEqual(payload, { status: 'active', updated: true });
    assert.equal(calls[0]?.url, '/api/bot-bindings/binding-1');
    assert.equal(calls[0]?.init?.method, 'PATCH');
    assert.deepEqual(calls[0]?.init?.headers, {
      'Content-Type': 'application/json',
    });
    assert.equal(
      calls[0]?.init?.body,
      JSON.stringify({
        status: 'active',
        webhookSecret: null,
      }),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
