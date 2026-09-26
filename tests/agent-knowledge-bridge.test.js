import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentKnowledgeBridge } from '../build/server/platform/knowledge/agentKnowledgeBridge.js';
import { inspectLocalKnowledge, mutateLocalKnowledge, LocalKnowledgeError } from '../build/server/platform/knowledge/localKnowledge.js';
import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createAuthenticatedTestSession, createTestAuthConfig, waitForCondition } from './testUtils.js';

const reply = { segments: [{ kind: 'text', text: 'Draft submitted.', toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
function capability(input) {
  const url = input.instructions.match(/^Endpoint: (.+)$/mu)?.[1];
  const authorization = input.instructions.match(/^Authorization: (.+)$/mu)?.[1];
  assert.ok(url && authorization, 'ordinary turn receives the callable contribution endpoint');
  return { url, headers: { authorization, 'content-type': 'application/json' } };
}
async function prepareDraft(cap, target = 'catlas') {
  const response = await fetch(cap.url, { headers: cap.headers });
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.deepEqual(Object.keys(state).sort(), ['revision', 'targets']);
  const entry = state.targets.find(row => row.target === target).entries[0];
  return { revision: state.revision, target, entryId: entry.id,
    content: { en: entry.content.en + ' Agent lesson.', 'zh-TW': entry.content['zh-TW'] + ' Agent 知識。' }, note: 'Observed fixture behavior.' };
}
const post = (cap, body) => fetch(cap.url, { method: 'POST', headers: cap.headers, body: JSON.stringify(body) });

async function fixture(t, overrides = {}) {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-agent-knowledge-'));
  let endpoint = null;
  let clock = Date.now();
  const bridge = createAgentKnowledgeBridge({ platformDir, endpoint: () => endpoint,
    resolveSource: async () => 'Agent contribution: conversation fixture; session fixture', now: () => clock, ...overrides });
  const server = createHttpServer((request, response) => {
    void bridge.route(request, response).then(handled => { if (!handled) { response.statusCode = 404; response.end(); } });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  endpoint = `http://127.0.0.1:${server.address().port}/api/code/knowledge/agent`;
  t.after(async () => { bridge.close(); server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  return { bridge, platformDir, expire: () => { clock += 16 * 60_000; },
    async turn(action) {
      const original = { marker: 'receiver', async sendMessage(id, content, input) {
        assert.equal(this.marker, 'receiver'); assert.equal(id, 'session'); assert.equal(content, 'user request');
        assert.equal(input.context.marker, 'retained'); assert.match(input.instructions, /^Existing instructions/u);
        await action(capability(input), client); return reply;
      }, async cancelSession() { assert.equal(this.marker, 'receiver'); } };
      const client = bridge.wrapClient(original);
      return client.sendMessage('session', 'user request', { instructions: 'Existing instructions', context: { marker: 'retained' } });
    } };
}

for (const target of ['catlas', 'orchestrator']) test(`agent submits ${target} draft once; existing manual adopt/revoke flow works`, async t => {
  const f = await fixture(t), before = await inspectLocalKnowledge(f);
  let cap, receipt;
  await f.turn(async current => {
    cap = current;
    const input = await prepareDraft(cap, target);
    const responses = await Promise.all([post(cap, input), post(cap, input)]);
    assert.deepEqual(responses.map(row => row.status), [200, 200]);
    receipt = await responses[0].json();
    assert.deepEqual(await responses[1].json(), receipt);
    assert.equal(receipt.status, 'pending_review'); assert.equal(receipt.reviewPath, '/code/knowledge');
    assert.equal((await post(cap, { ...input, note: 'Another draft' })).status, 409);
  });
  assert.equal((await fetch(cap.url, { headers: cap.headers })).status, 403);
  const pending = await inspectLocalKnowledge(f);
  assert.equal(pending.drafts.length, 1); assert.equal(pending.drafts[0].id, receipt.draftId);
  assert.equal(pending.drafts[0].active, false); assert.deepEqual(pending.targets, before.targets);
  assert.match(pending.drafts[0].note, /^Agent contribution: conversation fixture; session fixture/u);
  assert.ok(!(await readFile(join(f.platformDir, 'knowledge/contributions.json'), 'utf8')).includes(cap.headers.authorization.split(' ')[1]));
  const active = await mutateLocalKnowledge({ action: 'adopt', revision: pending.revision, id: receipt.draftId, confirm: 'manual-local-unverified' }, f);
  assert.equal(active.drafts[0].active, true);
  const restored = await mutateLocalKnowledge({ action: 'revoke', revision: active.revision, id: receipt.draftId }, f);
  assert.deepEqual(restored.targets, before.targets);
});

test('capability rejects missing/foreign tokens, browser origins, invalid payloads and adoption', async t => {
  const f = await fixture(t), other = await fixture(t);
  await f.turn(async cap => {
    const input = await prepareDraft(cap);
    assert.equal((await fetch(cap.url)).status, 403);
    assert.equal((await fetch(cap.url, { headers: { ...cap.headers, origin: 'https://untrusted.example' } })).status, 403);
    await other.turn(async foreign => { assert.equal((await fetch(foreign.url, { headers: cap.headers })).status, 403); });
    for (const extra of [{ action: 'adopt', confirm: 'manual-local-unverified' }, { action: 'revoke' }, { platformDir: other.platformDir }, { note: 'x'.repeat(801) }]) {
      assert.equal((await post(cap, { ...input, ...extra })).status, 400);
    }
    assert.equal((await post(cap, { ...input, revision: 'stale' })).status, 409);
    assert.equal((await fetch(cap.url, { method: 'DELETE', headers: cap.headers })).status, 405);
    assert.equal((await fetch(cap.url, { method: 'POST', headers: cap.headers, body: '{broken' })).status, 400);
    assert.equal((await fetch(cap.url, { method: 'POST', headers: cap.headers, body: 'x'.repeat(41 * 1024) })).status, 413);
  });
  assert.equal((await inspectLocalKnowledge(f)).drafts.length, 0);
  assert.equal((await inspectLocalKnowledge(other)).drafts.length, 0);
});

test('expiry and Runtime cancellation revoke the capability before a submit', async t => {
  const f = await fixture(t);
  await f.turn(async cap => { const input = await prepareDraft(cap); f.expire(); assert.equal((await post(cap, input)).status, 403); });
  await f.turn(async (cap, client) => { const input = await prepareDraft(cap); await client.cancelSession('session'); assert.equal((await post(cap, input)).status, 403); });
  let failedCap;
  await assert.rejects(f.turn(async cap => { failedCap = cap; throw new Error('Runtime failure'); }), /Runtime failure/u);
  assert.equal((await fetch(failedCap.url, { headers: failedCap.headers })).status, 403);
  assert.equal((await inspectLocalKnowledge(f)).drafts.length, 0);
});

test('body delayed past turn completion cannot submit a draft', async t => {
  const f = await fixture(t);
  let request, result, input;
  await f.turn(async cap => {
    input = await prepareDraft(cap);
    result = new Promise((resolve, reject) => {
      request = httpRequest(cap.url, { method: 'POST', headers: cap.headers }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.write('{');
    });
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  request.end(JSON.stringify(input).slice(1));
  assert.equal(await result, 403);
  assert.equal((await inspectLocalKnowledge(f)).drafts.length, 0);
});

test('cancellation or server shutdown while resolving the source cannot mint a late capability', async t => {
  for (const stop of ['cancelSession', 'closeSession', 'deleteSession', 'shutdown']) {
    let release;
    const source = new Promise(resolve => { release = resolve; });
    const f = await fixture(t, { resolveSource: () => source });
    let sends = 0;
    const client = f.bridge.wrapClient({ async sendMessage() { sends++; return reply; },
      async cancelSession() {}, async closeSession() {}, async deleteSession() {} });
    const pending = client.sendMessage('pending', 'request', {});
    const rejected = assert.rejects(pending, /cancelled/u);
    if (stop === 'shutdown') f.bridge.close(); else await client[stop]('pending');
    release('Agent contribution: delayed source');
    await rejected; assert.equal(sends, 0);
  }
});

test('an uncertain postcommit failure consumes the submission slot', async t => {
  const f = await fixture(t, { submit: async (...args) => {
    await mutateLocalKnowledge(...args);
    throw new Error('Store committed but final inspection failed');
  } });
  await f.turn(async cap => {
    const input = await prepareDraft(cap);
    assert.equal((await post(cap, input)).status, 500);
    assert.equal((await post(cap, input)).status, 500);
    assert.equal((await post(cap, await prepareDraft(cap))).status, 409);
    assert.equal((await inspectLocalKnowledge(f)).drafts.length, 1);
  });
});

test('store rechecks a queued capability and checks immediately before atomic replacement', async t => {
  const f = await fixture(t);
  const state = await inspectLocalKnowledge(f), entry = state.targets[0].entries[0];
  const input = { action: 'submit', revision: state.revision, target: 'catlas', entryId: entry.id, content: { en: 'New text', 'zh-TW': '新內容' } };
  let valid = true;
  const queued = mutateLocalKnowledge(input, f, () => { if (!valid) throw new LocalKnowledgeError('expired', 403); });
  valid = false;
  await assert.rejects(queued, /expired/u);
  await assert.rejects(mutateLocalKnowledge(input, f, () => {
    if (existsSync(join(f.platformDir, 'knowledge/contributions.json.bak'))) throw new LocalKnowledgeError('expired', 403);
  }), /expired/u);
  assert.equal((await inspectLocalKnowledge(f)).drafts.length, 0);
});

for (const originSurface of ['code', 'chat']) test(`actual ordinary ${originSurface} conversation delivers the capability and agent draft reaches the owner API`, async t => {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-agent-knowledge-server-'));
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now: new Date(), sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs });
  let receipt, cap;
  const runtimeClient = {
    async getHealth() { return { reachable: true }; },
    async getProviderDiagnostics() { return { providers: [] }; },
    async getProviderConfig() { return {}; },
    async createSession(input) { return { id: 'knowledge-agent-session', provider: input.provider, model: input.model, status: 'ready', cwd: platformDir }; },
    async observeSession() { return { session: { id: 'knowledge-agent-session', inspection: { state: 'idle' } } }; },
    async closeSession() {}, async cancelSession() {},
    async sendMessage(_session, _content, input) {
      cap = capability(input);
      const response = await post(cap, await prepareDraft(cap));
      assert.equal(response.status, 200);
      const submitted = await response.json();
      // Even a live agent grant cannot authenticate the owner adoption API.
      const revision = (await inspectLocalKnowledge({ platformDir })).revision;
      assert.equal((await fetch(new URL('/api/code/knowledge', cap.url), { method: 'POST', headers: cap.headers,
        body: JSON.stringify({ action: 'adopt', revision, id: submitted.draftId, confirm: 'manual-local-unverified' }) })).status, 401);
      receipt = submitted; return reply;
    },
  };
  const chatStore = new MemoryChatStore();
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 0,
    runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '', platformDir,
    chatStatePath: join(platformDir, 'state/chat.json'), runtimeDataDir: join(platformDir, 'runtime'), auth: authConfig },
  authStore: auth.authStore, runtimeClient }, chat: { chatStore } });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken, 'content-type': 'application/json', origin: 'http://127.0.0.1:8181' };
  const created = await fetch(`${base}/api/channels`, { method: 'POST', headers, body: JSON.stringify({ title: 'Knowledge contribution', topic: 'Isolated contribution test',
    originSurface, entryKind: 'group', skipBossCatGreeting: true,
    temporaryParticipants: [{ participantId: 'contributor', name: 'Contributor', provider: 'codex', instance: 'native', model: 'fixture' }] }) });
  assert.equal(created.status, 201, await created.clone().text());
  const { channel } = await created.json();
  const sent = await fetch(`${base}/api/channels/${channel.id}/messages`, { method: 'POST', headers,
    body: JSON.stringify({ body: 'Please contribute the lesson as a knowledge draft.', messageMetadata: { recipientParticipantIds: ['contributor'] } }) });
  assert.equal(sent.status, 200, await sent.clone().text());
  await waitForCondition(async () => receipt, { timeoutMs: 5000 });
  const ownerResponse = await fetch(`${base}/api/code/knowledge`, { headers });
  assert.equal(ownerResponse.status, 200);
  const workspace = await ownerResponse.json();
  assert.equal(workspace.drafts[0].id, receipt.draftId); assert.equal(workspace.drafts[0].active, false);
  assert.match(workspace.drafts[0].note, new RegExp(channel.id, 'u'));
  assert.match(workspace.drafts[0].note, /knowledge-agent-session/u);
  const adopted = await fetch(`${base}/api/code/knowledge`, { method: 'POST', headers,
    body: JSON.stringify({ action: 'adopt', revision: workspace.revision, id: receipt.draftId, confirm: 'manual-local-unverified' }) });
  assert.equal(adopted.status, 200);
  const active = await adopted.json(); assert.equal(active.drafts[0].active, true);
  const revoked = await fetch(`${base}/api/code/knowledge`, { method: 'POST', headers,
    body: JSON.stringify({ action: 'revoke', revision: active.revision, id: receipt.draftId }) });
  assert.equal(revoked.status, 200); assert.equal((await revoked.json()).drafts[0].active, false);
});
