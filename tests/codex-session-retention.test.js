import assert from 'node:assert/strict';
import test from 'node:test';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { inferCatlasData, inferCatlasAdvice } from '../build/server/platform/catlas/inference.js';

const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const config = { providers: { codex: { defaultInstance: 'native', defaultBackend: 'api', instances: [
  { id: 'native', target: 'api/native', backend: 'api' },
  { id: 'native', target: 'cli/native', backend: 'cli', continuity: { providerSessionPersistence: ['persistent', 'ephemeral'] } },
] } } };
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), init }; calls.push(call);
    return handler(call);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test('ephemeral capability is checked on the exact target before create', async () => {
  for (const registry of [config, { providers: { codex: { defaultInstance: 'native', instances: [{ id: 'native', backend: 'cli' }] } } }]) {
    await withFetch(() => json(registry), async calls => {
      const client = new CatsRuntimeClient('http://runtime.test');
      await assert.rejects(client.createSession({ provider: 'codex', providerSessionPersistence: 'ephemeral' }),
        error => error.code === 'provider_session_persistence_unsupported');
      assert.deepEqual(calls.map(c => new URL(c.url).pathname), ['/providers/config']);
    });
  }
});

test('client transports ephemeral policy and requires the admitted readback', async () => {
  for (const admitted of [true, false]) {
    await withFetch(({ url }) => json(url.endsWith('/providers/config') ? config
      : { id: 'fixture', providerName: 'codex', ...(admitted ? { providerSessionPersistence: 'ephemeral' } : {}) }), async calls => {
      const pending = new CatsRuntimeClient('http://runtime.test').createSession({
        provider: 'codex', instance: 'cli/native', providerSessionPersistence: 'ephemeral',
      });
      if (admitted) assert.equal((await pending).providerSessionPersistence, 'ephemeral');
      else await assert.rejects(pending, error => error.code === 'provider_session_persistence_unsupported');
      assert.equal(JSON.parse(calls.find(c => c.url.endsWith('/sessions')).init.body).providerSessionPersistence, 'ephemeral');
      assert.equal(calls.some(c => c.url.endsWith('/fixture/close')), !admitted);
      assert.equal(calls.some(c => c.url.endsWith('/messages')), false);
    });
  }
});

test('persistent labels are transported without changing the persistence default', async () => {
  await withFetch(() => json({ id: 'fixture', providerName: 'codex', sessionLabel: 'Cats Chat · Fixture' }), async calls => {
    const session = await new CatsRuntimeClient('http://runtime.test').createSession({ provider: 'codex', sessionLabel: 'Cats Chat · Fixture' });
    assert.equal(session.sessionLabel, 'Cats Chat · Fixture');
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.sessionLabel, session.sessionLabel);
    assert.equal('providerSessionPersistence' in payload, false);
  });
});

const guideCat = { id: 'catlas', executionTarget: { provider: 'codex', instance: 'cli/native', model: null } };
function fixture(admitted = true) {
  const calls = { create: [], send: [], close: [], cancel: [] };
  const client = {
    createSession: async input => {
      calls.create.push(input);
      return { id: `job-${calls.create.length}`, provider: input.provider, model: null,
        ...(admitted ? { providerSessionPersistence: 'ephemeral' } : {}) };
    },
    sendMessage: async (id, content) => {
      calls.send.push({ id, content });
      return { segments: [{ kind: 'text', text: JSON.stringify({ advice: 'Fixture advice', knowledgeIds: ['entry'] }) }] };
    },
    closeSession: async id => { calls.close.push(id); },
    cancelSession: async id => { calls.cancel.push(id); },
  };
  return { calls, client };
}
function data(client, kind = 'title', signal = new AbortController().signal) {
  return inferCatlasData({ runtimeClient: client, guideCat, kind, payload: { fixture: kind },
    format: 'JSON', requestId: kind, signal });
}
function advice(client, operation) {
  return inferCatlasAdvice({ runtimeClient: client, guideCat, locale: 'en', question: 'Fixture?',
    surface: 'fixture', observation: {}, bundle: { revision: 'fixture', digest: 'digest' },
    entries: [{ id: 'entry', revision: 1, digest: 'entry-digest', content: 'Fixture knowledge' }],
    signal: new AbortController().signal, operation });
}

test('all Catlas data jobs request ephemeral independently and close each session', async () => {
  const { client, calls } = fixture();
  for (const kind of ['title', 'refresh_prompt', 'refresh_navigation']) await data(client, kind);
  assert.equal(calls.create.length, 3);
  assert.ok(calls.create.every(c => c.providerSessionPersistence === 'ephemeral'));
  assert.deepEqual(calls.send.map(c => c.id), ['job-1', 'job-2', 'job-3']);
  assert.deepEqual(calls.close, ['job-1', 'job-2', 'job-3']);
});

test('advice operation feedback stays in one ephemeral job and executes once', async () => {
  const { client, calls } = fixture(); let operations = 0;
  await advice(client, async () => { operations++; return { verified: true }; });
  assert.equal(operations, 1);
  assert.equal(calls.create[0].providerSessionPersistence, 'ephemeral');
  assert.deepEqual(calls.send.map(c => c.id), ['job-1', 'job-1']);
  assert.deepEqual(calls.close, ['job-1']);
});

test('missing admission never sends content or performs a host operation', async () => {
  const { client, calls } = fixture(false); let operations = 0;
  await assert.rejects(data(client), /requires ephemeral/);
  await assert.rejects(advice(client, async () => { operations++; return {}; }), /requires ephemeral/);
  assert.equal(operations, 0);
  assert.equal(calls.send.length, 0);
  assert.deepEqual(calls.close, ['job-1', 'job-2']);
});

test('invalid output and cancellation close the job without a persistent retry', async () => {
  for (const cancel of [false, true]) {
    const { client, calls } = fixture();
    const controller = new AbortController();
    client.sendMessage = async () => {
      if (cancel) controller.abort();
      return { segments: [{ kind: 'text', text: 'invalid JSON' }] };
    };
    await assert.rejects(data(client, 'title', controller.signal));
    assert.equal(calls.create.length, 1);
    assert.deepEqual(calls.close, ['job-1']);
    assert.deepEqual(calls.cancel, cancel ? ['job-1'] : []);
  }
});
