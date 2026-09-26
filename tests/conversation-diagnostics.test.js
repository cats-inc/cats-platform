import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createServer } from '../build/server/app/server/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createChannel } from '../build/server/products/chat/state/model/index.js';
import { diagnosticText, readDiagnosticWithin } from '../build/server/products/shared/diagnosticReport.js';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { createAuthenticatedTestSession, createTestAuthConfig, waitForCondition } from './testUtils.js';

test('Runtime health preserves its reported version without inventing one for older services', async t => {
  let payload = { status: 'ok', version: '0.3.1' };
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
  const client = new CatsRuntimeClient('http://runtime.test');
  assert.equal((await client.getHealth()).version, '0.3.1');
  payload = { status: 'ok' };
  assert.equal((await client.getHealth()).version, undefined);
});

test('diagnostic error text is bounded and scrubs common credential formats before truncation', () => {
  const text = diagnosticText('Authorization: Bearer private-bearer api_key="private-key with spaces" '
    + 'TOKEN=private-token https://name:private-password@localhost/ sk-abcdefghijk12345 '
    + '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----');
  for (const secret of ['private-bearer', 'private-key', 'private-token', 'private-password', 'abcdefghijk', 'private-material']) {
    assert.ok(!text.includes(secret), secret);
  }
  assert.match(diagnosticText('x'.repeat(1500)), /truncated/u);
  assert.equal(diagnosticText('Cookie: theme=dark; cats_session=actual-session-value'), 'Cookie: [redacted]');
  assert.equal(diagnosticText('cats_session=actual-session-value'), 'cats_session=[redacted]');
  assert.equal(diagnosticText('Set-Cookie: cats_session=actual-session-value; Path=/\nHTTP 500'), 'Cookie: [redacted]\nHTTP 500');
});

test('missing or stalled Runtime reads produce unavailable evidence within a deadline', async () => {
  assert.equal(await readDiagnosticWithin(() => Promise.reject(new Error('private-token'))), null);
  assert.equal(await readDiagnosticWithin(() => new Promise(() => {}), 10), null);
});

for (const originSurface of ['chat', 'code']) test(`${originSurface}: selected incident diagnostics reach another ordinary agent as an attachment`, async t => {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-diagnostics-'));
  const now = new Date();
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now, sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs });
  const chatStore = new MemoryChatStore();
  let state = createChannel(await chatStore.read(), { title: 'Broken provider', topic: 'Incident', originSurface: 'chat', repoPath: platformDir }, now);
  const incident = state.channels.find(row => row.id === state.selectedChannelId);
  incident.orchestratorLease = { ...incident.orchestratorLease, sessionId: 'incident-session', provider: 'claude', model: 'fixture', status: 'error', cwd: platformDir,
    lastError: 'Provider exited: TOKEN=private-token' };
  incident.messages.push({ id: 'fixture-error', channelId: incident.id, senderKind: 'system', senderName: 'Runtime', body: 'Provider failed: api_key=private-key',
    mentions: [], metadata: { event: 'runtime_error', privateField: 'private-metadata' }, usage: null, createdAt: now.toISOString() });
  incident.messages.push({ id: 'fixture-user', channelId: incident.id, senderKind: 'user', senderName: 'Owner', body: 'private-transcript',
    mentions: [], metadata: {}, usage: null, createdAt: now.toISOString() });
  state = createChannel(state, { title: 'Unrelated', topic: 'Unrelated', originSurface: 'chat' }, now);
  state.channels.find(row => row.id === state.selectedChannelId).orchestratorLease.sessionId = 'unrelated-session';
  await chatStore.write(state);
  const observedIds = [];
  let unavailable = false;
  let delivered;
  const runtimeClient = {
    async getHealth() { return unavailable ? { reachable: false, status: 'error', error: 'Runtime offline' } : { reachable: true, status: 'ok', version: '0.3.1' }; },
    async getProviderDiagnostics() { return { providers: [] }; },
    async getProviderConfig() { return {}; },
    async createSession(input) { return { id: 'debugger-session', provider: input.provider, model: input.model, status: 'ready', cwd: platformDir }; },
    async observeSession(id) {
      observedIds.push(id);
      if (unavailable) throw new Error('Authorization: Bearer private-observe-token');
      return { session: { id, status: 'error', provider: 'claude', model: 'fixture', cwd: platformDir,
        context: { token: 'private-context' }, inspection: { transcript: 'private-inspection' } } };
    },
    async closeSession() {}, async cancelSession() {},
    async sendMessage(_id, content) {
      const relativePath = content.match(/- (\.cats-attachments\/[^\r\n]+)/u)?.[1];
      assert.ok(relativePath, content);
      delivered = await readFile(join(platformDir, relativePath), 'utf8');
      return { segments: [{ kind: 'text', text: 'Read diagnostic evidence.', toolName: null, toolId: null }], inputTokens: 1, outputTokens: 1, tokensUsed: 2 };
    },
  };
  const server = createServer({ shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110',
    runtimeApiKey: '', platformDir, chatStatePath: join(platformDir, 'state/chat.json'), runtimeDataDir: join(platformDir, 'runtime'), auth: authConfig },
    authStore: auth.authStore, runtimeClient }, chat: { chatStore } });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); await rm(platformDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken, 'content-type': 'application/json', origin: 'http://127.0.0.1:8181' };
  const url = `${base}/api/channels/${incident.id}/diagnostics`;
  observedIds.length = 0;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(`${base}/api/channels/absent/diagnostics`, { headers })).status, 404);
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const report = await response.json();
  assert.deepEqual(observedIds, ['incident-session']);
  for (const text of ['incident-session', '0.3.1', 'Broken provider', 'Runtime offline', 'unavailable (live trace disabled)']) {
    if (text !== 'Runtime offline') assert.ok(report.text.includes(text), text);
  }
  assert.ok(!report.text.includes('private-')); assert.ok(!report.text.includes('unrelated-session'));
  assert.equal(delivered, undefined, 'collecting makes no model request');
  unavailable = true;
  const partial = await (await fetch(url, { headers })).json();
  assert.match(partial.text, /unavailable \(missing session/u); assert.match(partial.text, /Runtime offline/u);
  assert.ok(!partial.text.includes('private-observe-token'));
  unavailable = false;
  const created = await fetch(`${base}/api/channels`, { method: 'POST', headers, body: JSON.stringify({ title: 'Debugger', topic: 'Read selected incident',
    originSurface, entryKind: 'group', repoPath: platformDir, skipBossCatGreeting: true,
    temporaryParticipants: [{ participantId: 'debugger', name: 'Debugger', provider: 'codex', instance: 'native', model: 'fixture' }] }) });
  assert.equal(created.status, 201, await created.clone().text());
  const { channel } = await created.json();
  const upload = await fetch(`${base}/api/channels/${channel.id}/attachments`, { method: 'POST', headers,
    body: JSON.stringify({ files: [{ name: report.filename, data: Buffer.from(report.text).toString('base64') }] }) });
  assert.equal(upload.status, 200, await upload.clone().text());
  const { attachments } = await upload.json();
  const sent = await fetch(`${base}/api/channels/${channel.id}/messages`, { method: 'POST', headers,
    body: JSON.stringify({ body: `[Attached files in working directory:]\n- ${attachments[0].relativePath}\n\nDebug the selected conversation.`,
      messageMetadata: { recipientParticipantIds: ['debugger'] } }) });
  assert.equal(sent.status, 200, await sent.clone().text());
  await waitForCondition(() => Boolean(delivered), { timeoutMs: 15_000 });
  assert.equal(delivered, report.text);
  const authState = await auth.authStore.readState();
  authState.memberships[0].roles = ['member']; await auth.authStore.writeState(authState);
  assert.equal((await fetch(url, { headers })).status, 403);
});
