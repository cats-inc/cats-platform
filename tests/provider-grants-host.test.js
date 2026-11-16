import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

import { routeProviderGrantsHost, PROVIDER_GRANTS_HOST_CANCEL_PATH } from '../build/server/products/chat/api/providerGrantsHost.js';
import { channelDispatchCancellationRegistry } from '../build/server/products/chat/state/runtime-dispatch/cancellation.js';
import { isInternalPlatformRoute } from '../build/server/platform/apps/ingressBoundary.js';

// ADR-155: the host's Stop cancels the chat turns of conversations holding the granted sessions.

const KEY = 'k'.repeat(40);
const lease = (sessionId) => ({ execution: { lease: { sessionId, status: 'ready' } } });

async function start(t, channels) {
  const cancelled = [];
  const deps = { chatStore: { read: async () => ({ channels }) }, runtimeClient: { cancelSession: async (id) => { cancelled.push(id); } },
    now: () => new Date('2026-11-16T00:00:00.000Z') };
  const server = createServer((request, response) => {
    void routeProviderGrantsHost(request, response, deps, KEY).then((handled) => { if (!handled) { response.statusCode = 404; response.end(); } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const post = (body, headers = { 'x-cats-desktop-auth-key': KEY }) => fetch(`http://127.0.0.1:${server.address().port}${PROVIDER_GRANTS_HOST_CANCEL_PATH}`,
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { post, cancelled };
}

test('host cancel needs the host key, cancels only conversations holding the sessions, and ingress refuses it', async (t) => {
  const channels = [
    { id: 'granted', participantAssignments: [{ participantId: 'p', ...lease('session-1') }], catAssignments: [],
      roomRouting: { workflow: { activeTurn: { id: 'turn' } } } },
    { id: 'other', participantAssignments: [{ participantId: 'q', ...lease('session-2') }], catAssignments: [], roomRouting: { workflow: { activeTurn: { id: 'turn' } } } },
  ];
  const { post, cancelled } = await start(t, channels);
  assert.equal((await post({ sessionIds: ['session-1'] }, {})).status, 403);
  assert.equal((await post({ sessionIds: ['session-1'] }, { 'x-cats-desktop-auth-key': 'x'.repeat(40) })).status, 403);
  assert.equal((await post({ sessionIds: 'session-1' })).status, 400);
  const answer = await post({ sessionIds: ['session-1'] });
  assert.equal(answer.status, 200);
  const body = await answer.json();
  assert.deepEqual(body.channels, ['granted']);
  assert.deepEqual(cancelled, ['session-1']);
  assert.ok(channelDispatchCancellationRegistry.read('granted'), 'the turn ends as stopped');
  assert.equal(channelDispatchCancellationRegistry.read('other') ?? null, null);
  channelDispatchCancellationRegistry.consume('granted');
  assert.equal(isInternalPlatformRoute(PROVIDER_GRANTS_HOST_CANCEL_PATH, 'POST'), true);
});
