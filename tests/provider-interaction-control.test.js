import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderInteractionControl } from '../build/server/platform/runtime/providerInteractionControl.js';

const binding = { conversationId: 'conversation', sessionId: 'session', participantId: 'cat', laneId: 'lane', turnId: 'turn', runId: null, label: 'Cat' };
const request = { interactionId: 'i', sessionId: 'session', workerGeneration: 'worker', executionId: 'execution', revision: 1,
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), status: 'pending', kind: 'mcp_url',
  prompt: { kind: 'mcp_url', title: 'Authorize', url: 'https://example.com/authorize' } };
const response = { binding, workerGeneration: 'worker', executionId: 'execution', expectedRevision: 1, idempotencyKey: 'owner-attempt', answer: { action: 'accept' } };

function setup() {
  let current = [{ binding: structuredClone(binding), canRespond: true }];
  const calls = [];
  const runtime = {
    async getSessionInteractions() { return { version: 1, sessionId: 'session', workerGeneration: 'worker', revision: 1, interactions: [structuredClone(request)] }; },
    async respondSessionInteraction(...args) { calls.push(args); return { ...request, status: 'resolved', prompt: undefined }; },
    async getSessionCapabilities() { return { version: 1, sessionId: 'session', workerGeneration: 'worker', supported: true }; },
  };
  const control = createProviderInteractionControl({ runtime, bindings: async id => id === 'conversation' ? current : [] });
  return { control, runtime, calls, replace: rows => { current = rows; } };
}

test('native response preserves same execution and uses only the control path', async () => {
  const { control, calls } = setup();
  const snapshot = await control.snapshot('conversation');
  assert.deepEqual(snapshot.interactions[0].binding, binding);
  assert.equal(await control.url('conversation', 'session', 'i', response), request.prompt.url);
  assert.equal(calls.length, 0, 'opening does not answer');
  await control.respond('conversation', 'session', 'i', response);
  assert.deepEqual(calls[0], ['session', 'i', { expectedRevision: 1, idempotencyKey: 'owner-attempt', answer: { action: 'accept' } }]);
});

test('cross-conversation, lane, generation and execution answers cannot reach the provider', async () => {
  const { control, calls } = setup();
  await assert.rejects(control.respond('other', 'session', 'i', response));
  for (const patch of [{ binding: { ...binding, laneId: 'other' } }, { binding: { ...binding, sessionId: 'other' } },
    { workerGeneration: 'old' }, { executionId: 'old' }, { binding: { ...binding, turnId: 'previous' } }]) {
    await assert.rejects(control.respond('conversation', 'session', 'i', { ...response, ...patch }));
  }
  assert.equal(calls.length, 0);
});

test('retarget or cancel while the authoritative request is loading revokes the reply', async () => {
  for (const action of ['retarget', 'cancel']) {
    const { control, runtime, calls, replace } = setup();
    const read = runtime.getSessionInteractions;
    runtime.getSessionInteractions = async () => {
      replace(action === 'retarget' ? [] : [{ binding, canRespond: false }]); return read();
    };
    await assert.rejects(control.respond('conversation', 'session', 'i', response));
    assert.equal(calls.length, 0);
  }
});

test('worker loss, expired and unsafe URLs do not open stale authorization', async () => {
  const { control, runtime, calls } = setup();
  runtime.getSessionInteractions = async () => { throw new Error('unavailable'); };
  await assert.rejects(control.url('conversation', 'session', 'i', response));
  assert.equal((await control.snapshot('conversation')).supported, false);
  for (const change of [{ expiresAt: new Date(0).toISOString() }, { status: 'resolved' }, { prompt: { url: 'file:///secret' } }, { prompt: { url: 'https://user:password@example.com' } }]) {
    runtime.getSessionInteractions = async () => ({ workerGeneration: 'worker', interactions: [{ ...request, ...change }] });
    await assert.rejects(control.url('conversation', 'session', 'i', response));
  }
  assert.equal(calls.length, 0);
});

test('ended runs project interrupted receipts without exposing retained prompts', async () => {
  const { control, replace } = setup();
  replace([{ binding, canRespond: false }]);
  const i = (await control.snapshot('conversation')).interactions[0];
  assert.equal(i.status, 'interrupted'); assert.equal(i.prompt, undefined);
});
