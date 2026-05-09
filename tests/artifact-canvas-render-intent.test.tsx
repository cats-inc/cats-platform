import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createDefaultCoreState } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { routeArtifactCanvasApi } from '../src/products/shared/artifactCanvas/api.ts';
import {
  composeArtifactCanvasNavigateIntent,
  type ArtifactCanvasNavigateIntent,
  type CanvasSurfaceRef,
} from '../src/products/shared/artifactCanvas/contracts.ts';
import {
  ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH,
  ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER,
  ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH,
  ArtifactCanvasRenderIntentHub,
  createArtifactCanvasIntentId,
} from '../src/products/shared/artifactCanvas/renderIntent.ts';

const SURFACE: CanvasSurfaceRef = {
  kind: 'code_task',
  surfaceId: 'task-canvas',
};

const NOW = new Date('2999-05-09T06:00:00.000Z');
const EXPIRES_AT = new Date(NOW.getTime() + 30_000).toISOString();

test('Artifact Canvas render intents are delivered only to active surface subscribers', () => {
  const hub = new ArtifactCanvasRenderIntentHub();
  const unfocused = createIntent('intent-unfocused');

  assert.deepEqual(hub.publish({ intent: unfocused, now: NOW }), {
    delivered: false,
    subscriberCount: 0,
    ownerSessionId: null,
  });
  assert.equal(hub.pendingCount, 0);

  const ownerDeliveries: ArtifactCanvasNavigateIntent[] = [];
  const otherSurfaceDeliveries: ArtifactCanvasNavigateIntent[] = [];
  const unsubscribeOwner = hub.subscribe({
    surface: SURFACE,
    sessionId: 'session-owner',
    send: (intent) => ownerDeliveries.push(intent),
    now: NOW,
  });
  const unsubscribeOtherSurface = hub.subscribe({
    surface: { kind: 'code_task', surfaceId: 'task-other' },
    sessionId: 'session-owner',
    send: (intent) => otherSurfaceDeliveries.push(intent),
    now: NOW,
  });

  const focused = createIntent('intent-focused');
  assert.deepEqual(hub.publish({ intent: focused, now: NOW }), {
    delivered: true,
    subscriberCount: 1,
    ownerSessionId: 'session-owner',
  });
  assert.deepEqual(ownerDeliveries.map((intent) => intent.intentId), ['intent-focused']);
  assert.deepEqual(otherSurfaceDeliveries, []);
  assert.equal(hub.getPendingIntent('intent-focused')?.sessionId, 'session-owner');

  unsubscribeOwner();
  unsubscribeOtherSurface();
});

test('Artifact Canvas ack endpoint uses fixed responses and session-bound ownership', async (t) => {
  const hub = new ArtifactCanvasRenderIntentHub();
  const ownerDeliveries: ArtifactCanvasNavigateIntent[] = [];
  const unsubscribe = hub.subscribe({
    surface: SURFACE,
    sessionId: 'session-owner',
    send: (intent) => ownerDeliveries.push(intent),
    now: NOW,
  });
  t.after(unsubscribe);

  const intent = createIntent('intent-owned');
  hub.publish({ intent, now: NOW });
  assert.equal(ownerDeliveries.length, 1);
  assert.equal(hub.getPendingIntent(intent.intentId)?.sessionId, 'session-owner');

  const server = createTestServer(hub);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const intruder = await postAck(server, intent.intentId, 'session-intruder');
  assert.equal(intruder.status, 200);
  assert.deepEqual(intruder.payload, { status: 'ok' });
  assert.equal(hub.getPendingIntent(intent.intentId)?.sessionId, 'session-owner');

  const owner = await postAck(server, intent.intentId, 'session-owner');
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.payload, { status: 'ok' });
  assert.equal(hub.getPendingIntent(intent.intentId), null);

  const repeatedOwner = await postAck(server, intent.intentId, 'session-owner');
  assert.equal(repeatedOwner.status, 200);
  assert.deepEqual(repeatedOwner.payload, { status: 'ok' });

  const unknown = await postAck(server, 'intent-never-issued', 'session-owner');
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.payload, { status: 'ok' });

  const replayDeliveries: ArtifactCanvasNavigateIntent[] = [];
  const unsubscribeReplay = hub.subscribe({
    surface: SURFACE,
    sessionId: 'session-owner',
    send: (replayed) => replayDeliveries.push(replayed),
    now: NOW,
  });
  unsubscribeReplay();
  assert.deepEqual(replayDeliveries, []);
});

test('Artifact Canvas stream endpoint sends private intent ids only to subscribers', async (t) => {
  const hub = new ArtifactCanvasRenderIntentHub();
  const server = createTestServer(hub);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await fetch(
    `${baseUrl(server)}${ARTIFACT_CANVAS_RENDER_INTENT_STREAM_PATH}`
    + '?surfaceKind=code_task&surfaceId=task-canvas',
    { headers: { [ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER]: 'session-owner' } },
  );
  assert.equal(response.status, 200);
  assert.ok(response.body, 'Expected SSE response body.');
  const reader = response.body.getReader();
  t.after(() => {
    void reader.cancel();
  });

  const connected = await readUntil(reader, 'event: connected');
  assert.match(connected, /event: connected/u);

  const intent = createIntent(createArtifactCanvasIntentId());
  assert.match(intent.intentId, /^[A-Za-z0-9_-]{22}$/u);
  hub.publish({ intent, targetSessionId: 'session-owner', now: NOW });

  const pushed = await readUntil(reader, 'event: artifact_canvas_intent');
  assert.match(pushed, /event: artifact_canvas_intent/u);
  assert.match(pushed, new RegExp(intent.intentId, 'u'));
  assert.doesNotMatch(response.url, new RegExp(intent.intentId, 'u'));
});

test('Artifact Canvas ack endpoint keeps malformed bodies indistinguishable', async (t) => {
  const hub = new ArtifactCanvasRenderIntentHub();
  const server = createTestServer(hub);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const response = await fetch(`${baseUrl(server)}${ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH}`, {
    method: 'POST',
    headers: {
      [ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER]: 'session-owner',
      'content-type': 'application/json',
    },
    body: '{not-json',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

function createIntent(intentId: string): ArtifactCanvasNavigateIntent {
  return composeArtifactCanvasNavigateIntent({
    intentId,
    activityId: `activity-${intentId}`,
    surface: SURFACE,
    artifactId: 'artifact-1',
    presentationRequested: 'auto',
    policyVersion: 'policy-v1',
    triggeredAt: NOW.toISOString(),
    expiresAt: EXPIRES_AT,
  });
}

function createTestServer(hub: ArtifactCanvasRenderIntentHub) {
  const store = new MemoryCoreStore(createDefaultCoreState());
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routeArtifactCanvasApi({
      request,
      response,
      url,
      method: request.method ?? 'GET',
      dependencies: {
        coreStore: store,
        renderIntentHub: hub,
      },
    });
    if (!handled) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not found' }));
    }
  });
}

async function postAck(
  server: ReturnType<typeof createServer>,
  intentId: string,
  sessionId: string,
) {
  const response = await fetch(`${baseUrl(server)}${ARTIFACT_CANVAS_RENDER_INTENT_ACK_PATH}`, {
    method: 'POST',
    headers: {
      [ARTIFACT_CANVAS_RENDER_INTENT_SESSION_HEADER]: sessionId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ intentId }),
  });
  return {
    status: response.status,
    payload: await response.json() as Record<string, unknown>,
  };
}

function baseUrl(server: ReturnType<typeof createServer>): string {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server is not listening.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (!buffer.includes(needle)) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    buffer += decoder.decode(next.value, { stream: true });
  }
  return buffer;
}
