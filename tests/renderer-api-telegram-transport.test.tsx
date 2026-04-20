import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchTelegramTransportDiagnostics,
  fetchTelegramTransportStatus,
  reconnectTelegramPolling,
} from '../src/products/shared/renderer/api/telegram.ts';

test('fetchTelegramTransportStatus reads the telegram payload envelope from the shared transport endpoint', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        telegram: {
          platform: 'telegram',
          status: 'bound',
          webhookPath: '/api/transports/telegram',
          diagnosticsPath: '/api/transports/telegram/diagnostics',
          roomRouting: {
            roomRoutingStatus: 'linked_room',
            linkedRoomId: 'room-1',
            note: 'ready',
          },
          ingress: {
            secretTokenConfigured: true,
            maxBodyBytes: 1024,
            acceptedUpdates: 3,
            ignoredUpdates: 1,
            lastReceipt: null,
          },
          delivery: {
            status: 'configured',
            supportedOperations: ['send'],
            sentCount: 2,
            repliedCount: 1,
            editedCount: 0,
            deletedCount: 0,
            failedCount: 0,
            lastReceipt: null,
          },
          note: 'healthy',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const signal = new AbortController().signal;
    const payload = await fetchTelegramTransportStatus(signal);

    assert.equal(payload.platform, 'telegram');
    assert.equal(payload.roomRouting.linkedRoomId, 'room-1');
    assert.equal(calls[0]?.url, '/api/transports/telegram');
    assert.deepEqual(calls[0]?.init?.headers, { Accept: 'application/json' });
    assert.equal(calls[0]?.init?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchTelegramTransportDiagnostics reads the diagnostics payload envelope', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        telegram: {
          platform: 'telegram',
          status: 'bound',
          webhookPath: '/api/transports/telegram',
          diagnosticsPath: '/api/transports/telegram/diagnostics',
          roomRouting: {
            roomRoutingStatus: 'placeholder',
            linkedRoomId: null,
            note: 'placeholder',
          },
          ingress: {
            secretTokenConfigured: false,
            maxBodyBytes: 1024,
            acceptedUpdates: 0,
            ignoredUpdates: 0,
            lastReceipt: null,
          },
          delivery: {
            status: 'not_configured',
            supportedOperations: [],
            sentCount: 0,
            repliedCount: 0,
            editedCount: 0,
            deletedCount: 0,
            failedCount: 0,
            lastReceipt: null,
          },
          note: 'waiting',
          dedupe: {
            retainedUpdateCount: 5,
            maxRetainedUpdateCount: 100,
          },
          bindings: [],
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const payload = await fetchTelegramTransportDiagnostics();

    assert.equal(payload.dedupe.retainedUpdateCount, 5);
    assert.equal(calls[0]?.url, '/api/transports/telegram/diagnostics');
    assert.deepEqual(calls[0]?.init?.headers, { Accept: 'application/json' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reconnectTelegramPolling posts to the reconnect endpoint and returns the parsed payload', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        polling: {
          bindingId: 'binding-1',
          health: 'healthy',
          lastPollTime: null,
          lastSuccessAt: null,
          lastPollError: null,
          consecutiveFailures: 0,
          processedUpdateCount: 12,
          lastProcessedUpdateId: 42,
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const signal = new AbortController().signal;
    const payload = await reconnectTelegramPolling('binding/1', signal);

    assert.equal(payload.polling?.processedUpdateCount, 12);
    assert.equal(
      calls[0]?.url,
      '/api/transports/telegram/polling/binding/1/reconnect',
    );
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.deepEqual(calls[0]?.init?.headers, { 'Content-Type': 'application/json' });
    assert.equal(calls[0]?.init?.signal, signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
