import assert from 'node:assert/strict';
import test from 'node:test';

import { CatsRuntimeClient } from '../src/runtime/client.ts';

test('runtime client covers lifecycle endpoints required by supervised runs', async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    requests.push({ url, method });

    if (url === 'http://runtime.test/sessions/session-1/resume') {
      return jsonResponse({
        id: 'session-1',
        providerName: 'codex',
        model: 'gpt-5.4',
        status: 'ready',
        cwd: 'C:/repo/cats-platform',
      });
    }
    if (url === 'http://runtime.test/sessions/session-1/observe') {
      return jsonResponse({ session: { id: 'session-1', status: 'ready' } });
    }
    if (url === 'http://runtime.test/sessions/session-1/cancel') {
      return jsonResponse({ action: 'cancel', status: 'ready' });
    }
    if (url === 'http://runtime.test/sessions/session-1/close') {
      return jsonResponse({ action: 'close', status: 'closed' });
    }
    if (url === 'http://runtime.test/sessions/session-1' && method === 'DELETE') {
      return jsonResponse({ sessionId: 'session-1', status: 'deleted' });
    }

    throw new Error(`Unexpected runtime client request: ${method} ${url}`);
  };

  try {
    const client = new CatsRuntimeClient('http://runtime.test');

    const resumed = await client.resumeSession('session-1');
    const observed = await client.observeSession('session-1');
    await client.cancelSession('session-1');
    await client.closeSession('session-1');
    const deleted = await client.deleteSession('session-1');

    assert.deepEqual(resumed, {
      id: 'session-1',
      provider: 'codex',
      model: 'gpt-5.4',
      modelSelection: null,
      modelResolution: null,
      status: 'ready',
      cwd: 'C:/repo/cats-platform',
      skills: undefined,
    });
    assert.deepEqual(observed, { session: { id: 'session-1', status: 'ready' } });
    assert.deepEqual(deleted, {
      action: undefined,
      sessionId: 'session-1',
      status: 'deleted',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { url: 'http://runtime.test/sessions/session-1/resume', method: 'POST' },
    { url: 'http://runtime.test/sessions/session-1/observe', method: 'GET' },
    { url: 'http://runtime.test/sessions/session-1/cancel', method: 'POST' },
    { url: 'http://runtime.test/sessions/session-1/close', method: 'POST' },
    { url: 'http://runtime.test/sessions/session-1', method: 'DELETE' },
  ]);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
