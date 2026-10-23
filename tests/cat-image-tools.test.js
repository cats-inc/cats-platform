import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createCatImageTools, CAT_IMAGE_TOOLS_PATH } from '../build/server/platform/multimedia/catImageTools.js';
import { isInternalPlatformRoute } from '../build/server/platform/apps/ingressBoundary.js';

const caller = { accountId: 'account-owner', ownerActorId: 'actor-owner', catId: 'cat-ordinary',
  conversationId: 'conversation-direct', runtimeSessionId: 'source-chat', trigger: 'heartbeat' };
const result = { schemaVersion: 1, id: '12345678-1234-1234-1234-123456789abc', requestId: '12345678-1234-1234-1234-123456789abc',
  provider: 'grok', targetId: 'grok/native', instance: 'native', operation: 'image.generate', profileId: 'grok-generate',
  profileRevision: '1', agentConfigId: 'grok-agent', agentModel: null, agentEffort: null, prompt: 'Morning cat',
  status: 'submitting', error: null, warnings: [], executionOutcome: null, output: null,
  createdAt: '2026-10-23T08:00:00Z', updatedAt: '2026-10-23T08:00:00Z' };

async function fixture(t, overrides = {}) {
  const submitted = [], released = [], cancelled = []; let clock = 1;
  const service = { async submit(scope, input, deferred, assertAllowed) {
    assertAllowed(); submitted.push({ scope, input, deferred }); return { ...result, requestId: input.requestId };
  }, releaseTurn: id => released.push(id), async cancelTurn(id) { cancelled.push(id); },
  async status() { return { job: result, delivery: { status: 'sent', transportMessageId: 'telegram-42', error: null } }; }, ...overrides.service };
  let endpoint;
  const tools = createCatImageTools({ service, endpoint: () => endpoint, now: () => clock,
    resolveTurn: overrides.resolveTurn ?? (async (sessionId, input) => input.context?.metadata?.approved
      ? { caller: { ...caller, runtimeSessionId: sessionId }, actionId: input.context.metadata.actionId } : null) });
  const server = createServer((req, res) => { void tools.route(req, res).then(handled => { if (!handled) res.writeHead(404).end(); }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}${CAT_IMAGE_TOOLS_PATH}`;
  t.after(async () => { tools.close(); await new Promise(resolve => server.close(resolve)); });
  const call = (token, method, params, extra = {}) => fetch(endpoint, { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { tools, call, submitted, released, cancelled, expire() { clock += 16 * 60_000; } };
}

test('real MCP supplies a stable session credential, a host-derived request and deferred dispatch', async t => {
  const f = await fixture(t); const tokens = []; let inputCount = 0;
  const client = f.tools.wrapClient({ async sendMessage(id, content, input) {
    inputCount++; const token = input.mcpServers.find(server => server.name === 'cats').auth.token; tokens.push(token);
    assert.equal(input.mcpServers[0].name, 'plugin-fixture');
    assert.equal(f.released.length, inputCount - 1);
    const list = await (await f.call(token, 'tools/list')).json(); assert.equal(list.result.tools[0].name, 'image_generate');
    for (const prompt of ['Morning cat', 'Morning cat']) {
      const response = await (await f.call(token, 'tools/call', { name: 'image_generate', arguments: { prompt, caption: '早安！' } })).json();
      assert.equal(response.result.structuredContent.queued, true); assert.equal(response.result.structuredContent.delivery, 'pending');
      assert.equal(JSON.stringify(response).includes('actor-owner'), false);
    }
    const status = await (await f.call(token, 'tools/call', { name: 'image_status', arguments: { jobId: result.id } })).json();
    assert.equal(status.result.structuredContent.delivery.status, 'sent');
    return { segments: [] };
  } });
  const options = { context: { metadata: { approved: true, actionId: 'heartbeat-one' } },
    mcpServers: [{ name: 'plugin-fixture', transport: 'http', url: 'http://127.0.0.1/plugin' }] };
  await client.sendMessage('source-chat', 'hello', options);
  await client.sendMessage('source-chat', 'hello again', options);
  assert.equal(tokens[0], tokens[1]); assert.equal(new Set(f.submitted.map(row => row.input.requestId)).size, 1);
  assert.equal(f.submitted.length, 4, 'status reads never submit generation');
  assert.ok(f.submitted.every(row => row.deferred && row.scope.catId === 'cat-ordinary'));
  assert.deepEqual(f.released, ['source-chat', 'source-chat']);
  assert.equal((await f.call(tokens[0], 'tools/call', { name: 'image_generate', arguments: { prompt: 'late', caption: '' } })).status, 401);
});

test('turn expiry, browser origin, wrong identity fields and cancellation cannot queue new work', async t => {
  const f = await fixture(t); let token;
  const client = f.tools.wrapClient({ async sendMessage(id, content, input) {
    token = input.mcpServers[0].auth.token;
    assert.equal((await f.call(token, 'tools/list', {}, { origin: 'http://localhost' })).status, 403);
    const invalid = await (await f.call(token, 'tools/call', { name: 'image_generate', arguments: { prompt: 'cat', caption: '', catId: 'other' } })).json();
    assert.equal(invalid.result.isError, true);
    f.expire(); assert.equal((await f.call(token, 'tools/call', { name: 'image_generate', arguments: { prompt: 'cat', caption: '' } })).status, 401);
    await client.cancelSession(id); return { segments: [] };
  }, async cancelSession() {} });
  await client.sendMessage('source-chat', 'hello', { context: { metadata: { approved: true, actionId: 'one' } } });
  assert.equal(f.submitted.length, 0); assert.equal(f.released.length, 0); assert.ok(f.cancelled.length > 0);
  assert.equal((await f.call(token, 'tools/list')).status, 401);
  assert.equal(isInternalPlatformRoute(CAT_IMAGE_TOOLS_PATH, 'POST'), true);
});

test('an asynchronous tool preflight cannot admit after its originating turn ends', async t => {
  let finishPreflight; let allowed = false;
  const f = await fixture(t, { service: { async submit(scope, input, deferred, assertAllowed) {
    await new Promise(resolve => { finishPreflight = resolve; }); assertAllowed(); allowed = true; return result;
  } } });
  let pending;
  const client = f.tools.wrapClient({ async sendMessage(id, content, input) {
    pending = f.call(input.mcpServers[0].auth.token, 'tools/call', { name: 'image_generate', arguments: { prompt: 'cat', caption: '' } });
    while (!finishPreflight) await new Promise(resolve => setTimeout(resolve, 1));
    return { segments: [] };
  } });
  await client.sendMessage('source-chat', 'hello', { context: { metadata: { approved: true, actionId: 'one' } } });
  finishPreflight(); const response = await (await pending).json();
  assert.equal(response.result.isError, true); assert.equal(allowed, false);
});

test('a lost send acknowledgement leaves queued work held for observed turn completion', async t => {
  const f = await fixture(t);
  const client = f.tools.wrapClient({ async sendMessage(id, content, input) {
    const queued = await (await f.call(input.mcpServers[0].auth.token, 'tools/call',
      { name: 'image_generate', arguments: { prompt: 'Morning cat', caption: 'Morning' } })).json();
    assert.equal(queued.result.structuredContent.queued, true);
    throw new Error('transport timeout with unknown turn state');
  } });
  await assert.rejects(client.sendMessage('source-chat', 'hello', { context: { metadata: { approved: true, actionId: 'one' } } }), /transport timeout/);
  assert.equal(f.submitted.length, 1); assert.equal(f.released.length, 0); assert.equal(f.tools.isTurnActive('source-chat'), false);
});

test('cancellation while resolving a tool grant cannot resurrect the originating runtime turn', async t => {
  let resolved; let entered = false; let sent = 0;
  const f = await fixture(t, { async resolveTurn() { entered = true; await new Promise(resolve => { resolved = resolve; }); return { caller, actionId: 'one' }; } });
  const client = f.tools.wrapClient({ async sendMessage() { sent++; }, async cancelSession() {} });
  const pending = client.sendMessage('source-chat', 'hello', {});
  while (!entered) await new Promise(resolve => setTimeout(resolve, 1));
  await client.cancelSession('source-chat'); resolved();
  await assert.rejects(pending, /image_turn_cancelled/); assert.equal(sent, 0);
});
