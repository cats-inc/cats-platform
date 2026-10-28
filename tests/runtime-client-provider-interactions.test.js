import assert from 'node:assert/strict';
import test from 'node:test';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { PLATFORM_INTERACTION_HOST } from '../build/server/shared/providerInteractions.js';
const policy = { version: 1, mode: 'explicit', access: 'workspace-write', network: false, approval: 'on-request' };
const registry = { providers: { codex: { defaultInstance: 'native', defaultBackend: 'api', instances: [
  { id: 'native', target: 'api/native', backend: 'api' },
  { id: 'native', target: 'cli/native', backend: 'cli', continuity: { interactions: { version: 1, kinds: PLATFORM_INTERACTION_HOST.kinds },
    sessionCapabilities: { version: 1, executionPolicy: true, inventory: true } } },
] } } };
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
async function fakeFetch(handler, run) {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init, calls); };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test('qualified native target negotiates only declared kinds and omits all legacy permission fields', async () => {
  await fakeFetch(url => json(url.endsWith('/providers/config') ? registry : { id: 'session', providerName: 'codex' }), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'test-key' });
    await client.createSession({ provider: 'codex', instance: 'cli/native', workspaceAccess: 'read_write', permissionMode: 'skip', allowedTools: [],
      executionPolicy: policy, interactionHost: { ...PLATFORM_INTERACTION_HOST, kinds: ['mcp_form'] } });
    const payload = JSON.parse(calls.find(c => c.url.endsWith('/sessions')).init.body);
    assert.deepEqual(payload.interactionHost.kinds, ['mcp_form']);
    assert.deepEqual(payload.executionPolicy, policy); assert.equal('permissionMode' in payload, false); assert.equal('allowedTools' in payload, false);
  });
});

test('a Claude Code target negotiates tool approval and reports its admissible ceilings', async () => {
  const claudeKinds = ['command_approval', 'file_approval', 'tool_approval', 'user_input', 'mcp_form', 'mcp_url'];
  const claude = { providers: { claude: { defaultInstance: 'native', instances: [{ id: 'native', target: 'cli/native', backend: 'cli',
    continuity: { interactions: { version: 1, kinds: claudeKinds }, sessionCapabilities: { version: 1, executionPolicy: true, inventory: true,
      admissibleCeilings: [{ access: 'full-access', network: true }, { access: 'unknown', network: true }] } } }] } } };
  await fakeFetch(url => json(url.endsWith('/providers/config') ? claude : { id: 'session', providerName: 'claude' }), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const config = await client.getProviderConfig();
    assert.deepEqual(config.claude.instances[0].continuity.sessionCapabilities.admissibleCeilings, [{ access: 'full-access', network: true }]);
    await client.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST });
    const payload = JSON.parse(calls.find(c => c.url.endsWith('/sessions')).init.body);
    assert.deepEqual(payload.interactionHost.kinds, claudeKinds);
    for (const narrow of [policy, { version: 1, mode: 'provider', constraints: { maxAccess: 'full-access', network: false } }]) {
      await assert.rejects(client.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST, executionPolicy: narrow }),
        error => error.code === 'provider_policy_unsupported' && /full-access with network/.test(error.message));
    }
    assert.equal(calls.filter(c => c.url.endsWith('/sessions')).length, 1);
    const full = { version: 1, mode: 'explicit', access: 'full-access', network: true, approval: 'on-request' };
    await client.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST, executionPolicy: full });
    assert.deepEqual(JSON.parse(calls.filter(c => c.url.endsWith('/sessions')).at(-1).init.body).executionPolicy, full);
  });
});

test('old Runtime retains legacy behavior but cannot silently ignore a requested policy', async () => {
  await fakeFetch(url => json(url.endsWith('/providers/config') ? { providers: {} } : { id: 's' }), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await client.createSession({ provider: 'codex', interactionHost: PLATFORM_INTERACTION_HOST });
    assert.equal(JSON.parse(calls.find(c => c.url.endsWith('/sessions')).init.body).permissionMode, 'skip');
    await assert.rejects(client.createSession({ provider: 'codex', interactionHost: PLATFORM_INTERACTION_HOST, executionPolicy: policy }), /does not support/);
    assert.equal(calls.filter(c => c.url.endsWith('/sessions')).length, 1);
  });
});

test('resume readmits the observed original backend even after provider defaults change', async () => {
  await fakeFetch(url => json(url.endsWith('/providers/config') ? registry : url.endsWith('/observe')
    ? { session: { providerName: 'codex', providerInstanceId: 'native', providerBackend: 'cli' } } : { id: 's' }), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test');
    await client.resumeSession('s', { interactionHost: PLATFORM_INTERACTION_HOST, executionPolicy: policy });
    const payload = JSON.parse(calls.find(c => c.url.endsWith('/resume')).init.body);
    assert.deepEqual(payload.executionPolicy, policy); assert.equal(payload.interactionHost.version, 1);
  });
});

test('same-turn native control and inventory requests use bearer auth without sending a model prompt', async () => {
  await fakeFetch(() => json({ version: 1, sessionId: 'a/b', interactions: [] }), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test', { apiKey: 'test-key' });
    await client.getSessionInteractions('a/b'); await client.getSessionCapabilities('a/b', true);
    await client.respondSessionInteraction('a/b', 'i/x', { expectedRevision: 1, idempotencyKey: 'retry', answer: { action: 'decline' } });
    assert.equal(calls.length, 3); assert.ok(calls.every(c => c.url.includes('/sessions/a%2Fb/')));
    assert.ok(calls.every(c => c.init.headers.Authorization === 'Bearer test-key' || c.init.headers.authorization === 'Bearer test-key'));
    assert.ok(calls.every(c => !c.url.endsWith('/messages')));
  });
});

test('bounded native snapshots preserve UTF-8 characters split across stream chunks', async () => {
  const snapshot = { version: 1, label: '貓🐈', interactions: [] };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  await fakeFetch(() => new Response(new ReadableStream({
    start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); },
  })), async () => {
    assert.deepEqual(await new CatsRuntimeClient('http://runtime.test').getSessionInteractions('s'), snapshot);
  });
});

test('native control bounds count bytes and cancel oversized response streams', async () => {
  let cancelled = false;
  await fakeFetch(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); },
    cancel() { cancelled = true; },
  })), async calls => {
    const client = new CatsRuntimeClient('http://runtime.test');
    const response = { answer: { action: 'accept', values: { text: '🐈'.repeat(10_000) } } };
    assert.ok(JSON.stringify(response).length < 36 * 1024);
    assert.throws(() => client.respondSessionInteraction('s', 'i', response), /exceeds limit/);
    assert.equal(calls.length, 0);
    await assert.rejects(client.getSessionInteractions('s'), /exceeds limit/);
    assert.equal(cancelled, true);
  });
});

test('bounded human waiting resets message idle timeout until the native turn continues', async () => {
  let resets = 0, polls = 0;
  let finishMessage;
  await fakeFetch((url, init) => {
    if (url.endsWith('/providers/config')) return json(registry);
    if (url.endsWith('/sessions')) return json({ id: 's', providerName: 'codex' });
    if (url.endsWith('/interactions')) {
      polls++;
      if (polls === 3) finishMessage(new Response('{"type":"result"}\n'));
      return json({ interactions: [{ status: 'pending', expiresAt: new Date(Date.now() + 10_000).toISOString() }] });
    }
    if (url.endsWith('/messages')) return new Promise(resolve => { finishMessage = resolve; });
    throw new Error('Unexpected endpoint');
  }, async () => {
    const client = new CatsRuntimeClient('http://runtime.test', { messageIdleTimeoutMs: 150,
      createIdleTimeoutController: () => ({ signal: new AbortController().signal, reset: () => { resets++; }, clear() {} }) });
    await client.createSession({ provider: 'codex', instance: 'cli/native', interactionHost: PLATFORM_INTERACTION_HOST });
    const watchdog = setTimeout(() => {}, 3000);
    try { await client.sendMessage('s', 'wait for owner'); } finally { clearTimeout(watchdog); }
    assert.ok(polls >= 2); assert.ok(resets >= 2);
    const finishedPolls = polls; await new Promise(r => setTimeout(r, 75)); assert.equal(polls, finishedPolls);
  });
});

test('a late interaction read cannot restart the idle timer after message completion', async () => {
  let finishMessage, finishPoll, pollStarted;
  const started = new Promise(resolve => { pollStarted = resolve; });
  let cleared = false, resetsAfterClear = 0;
  await fakeFetch(url => {
    if (url.endsWith('/providers/config')) return json(registry);
    if (url.endsWith('/sessions')) return json({ id: 's', providerName: 'codex' });
    if (url.endsWith('/interactions')) return new Promise(resolve => { finishPoll = resolve; pollStarted(); });
    if (url.endsWith('/messages')) return new Promise(resolve => { finishMessage = resolve; });
    throw new Error('Unexpected endpoint');
  }, async () => {
    const client = new CatsRuntimeClient('http://runtime.test', { messageIdleTimeoutMs: 150,
      createIdleTimeoutController: () => ({ signal: new AbortController().signal,
        reset() { if (cleared) resetsAfterClear++; }, clear() { cleared = true; } }) });
    await client.createSession({ provider: 'codex', instance: 'cli/native', interactionHost: PLATFORM_INTERACTION_HOST });
    const message = client.sendMessage('s', 'wait');
    // Keep the process alive while the client's unref'ed polling timer is pending.
    const watchdog = setTimeout(() => {}, 3000);
    try {
      await started; finishMessage(new Response('{"type":"result"}\n')); await message;
      finishPoll(json({ interactions: [{ status: 'pending', expiresAt: new Date(Date.now() + 10_000).toISOString() }] }));
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(resetsAfterClear, 0);
    } finally { clearTimeout(watchdog); }
  });
});
