import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { withConversationBrowserIntegration } from '../build/server/platform/runtime/providerBrowserIntegration.js';
import { routeProviderInteractions } from '../build/server/products/shared/api/providerInteractions.js';
import { PLATFORM_INTERACTION_HOST } from '../build/server/shared/providerInteractions.js';
import { resolvePlatformPreferencesPath } from '../build/server/shared/platformPreferences.js';

const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const continuity = browserIntegration => ({ interactions: { version: 1, kinds: ['tool_approval', 'user_input'] },
  sessionCapabilities: { version: 1, executionPolicy: true, inventory: true, ...(browserIntegration ? { browserIntegration: true } : {}) } });
const registry = { providers: {
  claude: { defaultInstance: 'native', instances: [{ id: 'native', target: 'cli/native', backend: 'cli', continuity: continuity(true) }] },
  codex: { defaultInstance: 'native', instances: [{ id: 'native', target: 'cli/native', backend: 'cli', continuity: continuity(false) }] },
} };

test('the client forwards browser integration only with a negotiated host to an advertising target', async () => {
  const original = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/sessions')) sent.push(JSON.parse(init.body));
    return json(String(url).endsWith('/providers/config') ? registry : { id: 's', providerName: 'claude' });
  };
  try {
    const client = new CatsRuntimeClient('http://runtime.test');
    await client.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST, browserIntegration: true });
    await client.createSession({ provider: 'codex', interactionHost: PLATFORM_INTERACTION_HOST, browserIntegration: true });
    await client.createSession({ provider: 'claude', browserIntegration: true });
    assert.deepEqual(sent.map(body => body.browserIntegration), [true, undefined, undefined]);
  } finally { globalThis.fetch = original; }
});

test('only callers that host approval cards request Claude in Chrome, and only while it is enabled', async () => {
  const seen = [];
  const runtime = {
    async createSession(input) { seen.push(['create', input.browserIntegration]); return { id: 's' }; },
    async resumeSession(id, input) { seen.push(['resume', input?.browserIntegration]); return { id }; },
  };
  let enabled = true;
  const wrapped = withConversationBrowserIntegration(runtime, async () => enabled);
  await wrapped.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST });
  await wrapped.createSession({ provider: 'claude', context: { metadata: { supervisionProduct: 'cats-work' } } });
  await wrapped.resumeSession('s', { interactionHost: PLATFORM_INTERACTION_HOST });
  await wrapped.resumeSession('s');
  enabled = false;
  await wrapped.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST });
  const failing = withConversationBrowserIntegration(runtime, async () => { throw new Error('unreadable preferences'); });
  await failing.createSession({ provider: 'claude', interactionHost: PLATFORM_INTERACTION_HOST });
  assert.deepEqual(seen, [['create', true], ['create', undefined], ['resume', true], ['resume', undefined],
    ['create', undefined], ['create', undefined]]);
});

test('resuming a live worker started with the other setting keeps that worker instead of failing', async () => {
  const conflict = Object.assign(new Error('Close the active worker before changing its browser integration.'), { status: 409, code: 'interaction_conflict' });
  const calls = [];
  const runtime = { async createSession() { return { id: 's' }; }, async resumeSession(id, input) {
    calls.push(input?.browserIntegration); if (input?.browserIntegration) throw conflict; return { id }; } };
  const wrapped = withConversationBrowserIntegration(runtime, async () => true);
  assert.deepEqual(await wrapped.resumeSession('s', { interactionHost: PLATFORM_INTERACTION_HOST }), { id: 's' });
  assert.deepEqual(calls, [true, undefined]);
  const other = withConversationBrowserIntegration({ async createSession() { return {}; },
    async resumeSession() { throw Object.assign(new Error('gone'), { status: 404 }); } }, async () => true);
  await assert.rejects(other.resumeSession('s', { interactionHost: PLATFORM_INTERACTION_HOST }), /gone/);
});

function routeContext({ method = 'GET', body, remoteAddress = '127.0.0.1', role = 'owner', credentialKind = 'browser_cookie', chatStatePath }) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const request = Object.assign((async function* () { yield* chunks; })(), { socket: { remoteAddress }, headers: {} });
  const result = {};
  const response = { writeHead(status) { result.status = status; }, end(text) { result.body = JSON.parse(text); } };
  return { result, context: { method, request, response, url: new URL('http://127.0.0.1/api/provider-interactions/preferences'),
    auth: { credentialKind, principal: { membership: { roles: [role] } } },
    dependencies: { chatStatePath, runtimeClient: {}, bindings: async () => [] } } };
}

test('the Claude in Chrome preference is off by default and only the local owner can change it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-chrome-preference-'));
  const chatStatePath = path.join(root, 'platform', 'state', 'chat-state.local.json');
  try {
    const call = async options => { const { result, context } = routeContext({ chatStatePath, ...options });
      assert.equal(await routeProviderInteractions(context), true); return result; };
    assert.deepEqual(await call({}), { status: 200, body: { claudeInChromeEnabled: false } });
    assert.equal((await call({ method: 'POST', body: { claudeInChromeEnabled: true }, remoteAddress: '192.168.1.20' })).status, 403);
    assert.equal((await call({ method: 'POST', body: { claudeInChromeEnabled: true }, role: 'member' })).status, 403);
    assert.equal((await call({ method: 'POST', body: { claudeInChromeEnabled: true }, credentialKind: 'mobile_bearer' })).status, 403);
    assert.equal((await call({ method: 'POST', body: { claudeInChromeEnabled: 'yes' } })).status, 400);
    assert.equal((await call({ method: 'POST', body: '{' })).status, 400);
    assert.deepEqual(await call({}), { status: 200, body: { claudeInChromeEnabled: false } });
    assert.deepEqual(await call({ method: 'POST', body: { claudeInChromeEnabled: true } }), { status: 200, body: { claudeInChromeEnabled: true } });
    const stored = JSON.parse(await readFile(resolvePlatformPreferencesPath(chatStatePath), 'utf8'));
    assert.equal(stored.claudeInChromeEnabled, true);
    assert.equal((await call({ method: 'DELETE' })).status, 405);
  } finally { await rm(root, { recursive: true, force: true }); }
});
