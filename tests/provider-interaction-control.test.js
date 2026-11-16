import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderInteractionControl } from '../build/server/platform/runtime/providerInteractionControl.js';

const binding = { conversationId: 'conversation', sessionId: 'session', participantId: 'cat', laneId: 'lane', turnId: 'turn', runId: null, label: 'Cat' };
const request = { interactionId: 'i', sessionId: 'session', workerGeneration: 'worker', executionId: 'execution', revision: 1,
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), status: 'pending', kind: 'mcp_url',
  prompt: { kind: 'mcp_url', title: 'Authorize', url: 'https://example.com/authorize' } };
const response = { binding, workerGeneration: 'worker', executionId: 'execution', expectedRevision: 1, idempotencyKey: 'owner-attempt', answer: { action: 'accept' } };

function setup() {
  // The full suite loads this module long before its tests run. Start the TTL here.
  const liveRequest = { ...request, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  let current = [{ binding: structuredClone(binding), canRespond: true }];
  const calls = [];
  const runtime = {
    async getSessionInteractions() { return { version: 1, sessionId: 'session', workerGeneration: 'worker', revision: 1, interactions: [structuredClone(liveRequest)] }; },
    async respondSessionInteraction(...args) { calls.push(args); return { ...liveRequest, status: 'resolved', prompt: undefined }; },
    async getSessionCapabilities() { return { version: 1, sessionId: 'session', workerGeneration: 'worker', supported: true }; },
  };
  const control = createProviderInteractionControl({ runtime, bindings: async id => id === 'conversation' ? current : [] });
  return { control, runtime, calls, request: liveRequest, replace: rows => { current = rows; } };
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
  const { control, runtime, calls, request } = setup();
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

test('ADR-155: only the owner may grant; a grant answer passes through intact', async () => {
  const { control, calls } = setup();
  const granting = { ...response, answer: { action: 'accept', choice: 'allow_once', standingGrant: { until: 'session' } } };
  await assert.rejects(control.respond('conversation', 'session', 'i', granting), { status: 403, code: 'standing_grant_owner_only' });
  await assert.rejects(control.respond('conversation', 'session', 'i', granting, { owner: false }), { code: 'standing_grant_owner_only' });
  assert.equal(calls.length, 0);
  await control.respond('conversation', 'session', 'i', granting, { owner: true });
  assert.deepEqual(calls[0][2].answer.standingGrant, { until: 'session' });
});

test('ADR-155: the snapshot lists grants, and Stop trusts only what Runtime confirms', async () => {
  const { control, runtime } = setup();
  const grant = { category: 'computer_use', until: 'session', grantedAt: new Date().toISOString() };
  let held = [grant];
  const read = runtime.getSessionInteractions;
  runtime.getSessionInteractions = async () => ({ ...(await read()), ...(held.length ? { standingGrants: held } : {}) });
  assert.deepEqual((await control.snapshot('conversation')).standingGrants, [{ binding, standingGrants: [grant] }]);
  // Runtime still reports a grant: Stop fails and nothing is claimed.
  runtime.revokeStandingGrants = async () => ({ version: 1, sessionId: 'session', workerGeneration: 'worker', revision: 1, interactions: [], standingGrants: held });
  await assert.rejects(control.stopStandingGrants('conversation'), { code: 'standing_grants_unconfirmed' });
  // An unreachable Runtime is not a confirmation either.
  runtime.revokeStandingGrants = async () => { throw new Error('timeout'); };
  await assert.rejects(control.stopStandingGrants('conversation'), { code: 'standing_grants_unconfirmed' });
  // A session Runtime no longer has holds no grants: 404 counts as confirmed.
  const { RuntimeRequestError } = await import('../build/server/runtime/client.js');
  runtime.revokeStandingGrants = async () => { held = []; throw new RuntimeRequestError('gone', 404); };
  assert.equal((await control.stopStandingGrants('conversation')).standingGrants, undefined);
  // Confirmed by an empty list.
  held = [grant];
  runtime.revokeStandingGrants = async () => { held = []; return { version: 1, sessionId: 'session', workerGeneration: 'worker', revision: 1, interactions: [] }; };
  assert.equal((await control.stopStandingGrants('conversation')).standingGrants, undefined);
});

test('ADR-155: no send is marked to use grants while Stop runs', async () => {
  const { standingGrantSends } = await import('../build/server/platform/runtime/standingGrantSends.js');
  const message = { id: 'owner-message', senderKind: 'user', metadata: { ownerStarted: 'desktop', desktopControlEntry: 'local' } };
  assert.equal(standingGrantSends.allows(message), false, 'unmarked');
  const release = standingGrantSends.mark(message.id);
  assert.equal(standingGrantSends.allows(message), true);
  assert.equal(standingGrantSends.allows({ ...message, metadata: { ownerStarted: 'desktop' } }), false, 'needs the local stamp');
  assert.equal(standingGrantSends.allows({ ...message, metadata: { desktopControlEntry: 'local' } }), false, 'needs the owner stamp');
  assert.equal(standingGrantSends.allows({ ...message, choiceResponse: { status: 'submitted' } }), false, 'never a choice answer');
  let during = null;
  await standingGrantSends.whileStopping(async () => { during = standingGrantSends.allows(message); });
  assert.equal(during, false);
  assert.equal(standingGrantSends.allows(message), true);
  release(); release();
  assert.equal(standingGrantSends.allows(message), false, 'released once, idempotently');
});
