import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import test from 'node:test';
import { loadCatlasKnowledge, selectCatlasKnowledge } from '../build/server/platform/catlas/knowledge.js';
import { parseCatlasAdvice } from '../build/server/platform/catlas/inference.js';
import { createCodeCatlasHelpService } from '../build/server/products/code/state/catlasHelp.js';
import { routeCodeApi } from '../build/server/products/code/api/index.js';
import { MemoryCoreStore } from '../build/server/core/store.js';
import { writeGuideCatAssistConfig } from '../build/server/shared/guideCatAssistStore.js';
import { classifyPlatformAuthRoute } from '../build/server/app/server/authGatePolicy.js';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { inferCatlasAdvice } from '../build/server/platform/catlas/inference.js';
import { inspectLocalKnowledge, mutateLocalKnowledge } from '../build/server/platform/knowledge/localKnowledge.js';

const sourceKnowledge = await readFile(resolve('config/catlas-knowledge.json'), 'utf8');
const guideCat = {
  id: 'guide-cat-primary', name: 'Catlas', status: 'active',
  executionTarget: { provider: 'claude', instance: 'help-instance', model: 'help-model' },
  modelSelection: null, createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z',
};

function request(overrides = {}) {
  return {
    locale: 'en', question: 'How do I start this project?',
    draft: { cwd: null, target: null,
      policy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' },
    },
    ...overrides,
  };
}

async function fixture(t, runtimeOverrides = {}, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-catlas-help-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-catlas-help-')));
    await rm(root, { recursive: true, force: true });
  });
  const knowledgeFilePath = join(root, 'config', 'catlas-knowledge.json');
  const chatStatePath = join(root, 'platform', 'state', 'chat-state.local.json');
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(knowledgeFilePath, sourceKnowledge);
  const coreStore = new MemoryCoreStore();
  await coreStore.updateCore((core) => ({ ...core, guideCat }));
  const calls = { create: [], send: [], close: [], cancel: [] };
  const runtimeClient = {
    getHealth: async () => ({ reachable: true, baseUrl: 'http://127.0.0.1:3110', status: 'ok' }),
    getProviderDiagnostics: async ({ provider, instance }) => ({ providers: [{
      provider, instance, defaultTarget: true, availability: { status: 'ok' },
    }] }),
    createSession: async (input) => {
      calls.create.push(input);
      return { id: 'help-session', provider: input.provider, model: input.model, status: 'ready', cwd: null };
    },
    sendMessage: async (sessionId, content, input) => {
      calls.send.push({ sessionId, content, input });
      const prompt = JSON.parse(content);
      const advice = prompt.observation.targetAvailability === 'unselected'
        ? 'Choose a coding target, then select your project folder.'
        : prompt.observation.requestedPolicy.workspaceAccess === 'read_only'
          ? 'Use read-only access to inspect the project; explicitly choose writable access for edits.'
          : 'Describe the task and send; verify the new session workspace.';
      return { segments: [{ kind: 'text', text: JSON.stringify({ advice, knowledgeIds: ['code.entry'] }) }] };
    },
    closeSession: async (id) => { calls.close.push(id); },
    cancelSession: async (id) => { calls.cancel.push(id); },
    ...runtimeOverrides,
  };
  const service = createCodeCatlasHelpService({
    coreStore, runtimeClient, chatStatePath, knowledgeFilePath, ...options,
  });
  return { root, coreStore, runtimeClient, calls, knowledgeFilePath, chatStatePath, service };
}

test('help uses local adoption from its explicit owning profile', async (t) => {
  const f = await fixture(t);
  const options = { platformDir: join(f.root, 'platform') };
  const initial = await inspectLocalKnowledge(options);
  const entry = initial.targets.find(row => row.target === 'catlas').entries[0];
  const draft = await mutateLocalKnowledge({ action: 'submit', revision: initial.revision, target: 'catlas',
    entryId: entry.id, content: { en: entry.content.en + ' Explicit profile lesson.', 'zh-TW': entry.content['zh-TW'] + ' 指定資料區知識。' } }, options);
  await mutateLocalKnowledge({ action: 'adopt', revision: draft.revision, id: draft.drafts[0].id,
    confirm: 'manual-local-unverified' }, options);
  const service = createCodeCatlasHelpService({ coreStore: f.coreStore, runtimeClient: f.runtimeClient,
    chatStatePath: f.chatStatePath, ...options });
  assert.equal((await service.help(request(), new AbortController().signal)).source, 'model');
  const delivered = JSON.parse(f.calls.send[0].content).knowledge;
  assert.ok(delivered.some(row => row.content.includes('Explicit profile lesson.') && row.adoption?.kind === 'manual-local-unverified'));
});

test('source-free bilingual knowledge has stable provenance and content digests', async (t) => {
  const f = await fixture(t);
  const en = await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en' });
  const zh = await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'zh-TW' });
  assert.equal(en.status, 'ready');
  assert.equal(zh.status, 'ready');
  assert.equal(en.bundle.digest, zh.bundle.digest);
  assert.notEqual(en.bundle.entries[0].digest, zh.bundle.entries[0].digest);
  assert.match(zh.bundle.entries[0].content, /工作階段/u);
  assert.equal(selectCatlasKnowledge(en.bundle, []).length, 1);
  assert.deepEqual(selectCatlasKnowledge(en.bundle, ['workspace']).map((entry) => entry.id),
    ['code.entry', 'code.workspace']);
  assert.equal(en.bundle.entries.every((entry) => entry.sources.length && entry.digest.length === 64), true);
});

test('missing, incompatible, malformed and duplicate knowledge never becomes usable advice', async (t) => {
  const f = await fixture(t);
  assert.equal((await loadCatlasKnowledge({ filePath: join(f.root, 'missing.json'), locale: 'en' })).status, 'missing');
  assert.equal((await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en', platformVersion: '0.3.9' })).status, 'incompatible');
  assert.equal((await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en', capabilities: [] })).status, 'incompatible');
  for (const mutate of [
    (raw) => { raw.entries.push(raw.entries[0]); },
    (raw) => { raw.entries[0].content.en = ''; },
    (raw) => { raw.schemaVersion = 9; },
  ]) {
    const raw = JSON.parse(sourceKnowledge); mutate(raw);
    await writeFile(f.knowledgeFilePath, JSON.stringify(raw));
    assert.equal((await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en' })).status, 'invalid');
  }
  await writeFile(f.knowledgeFilePath, 'x'.repeat(128 * 1024 + 1));
  assert.equal((await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en' })).status, 'invalid');
});

test('help sends actual knowledge to the Core-bound model in a fresh read-only session', async (t) => {
  const f = await fixture(t);
  const before = await f.coreStore.readCore();
  const input = request();
  input.draft.target = { provider: 'codex', instance: null, model: 'coding-model' };
  input.draft.target.unboundedExtra = 'private-extra-context';
  input.draft.policy.unboundedExtra = 'private-extra-context';
  input.draft.cwd = f.root;
  const result = await f.service.help(input, new AbortController().signal);
  assert.equal(result.source, 'model');
  const session = f.calls.create[0];
  assert.equal(session.provider, 'claude');
  assert.equal(session.model, 'help-model');
  assert.equal(session.instance, 'help-instance');
  assert.equal(session.workspaceKind, 'sandbox');
  assert.equal(session.workspaceAccess, 'read_only');
  assert.equal(session.permissionMode, 'default');
  assert.equal(session.sharingMode, 'isolated');
  assert.equal(session.cwd, undefined);
  assert.deepEqual(session.skills.requestedSkills, []);
  const prompt = JSON.parse(f.calls.send[0].content);
  assert.match(prompt.knowledge[0].content, /Cats Code starts a coding conversation/u);
  assert.equal(prompt.observation.draftTarget.provider, 'codex');
  assert.equal(prompt.observation.workspace.selection, 'directory');
  assert.equal(prompt.observation.workspace.gitStatus, 'unknown');
  assert.equal(prompt.observation.effectiveSessionAccess, 'not_started');
  assert.equal(f.calls.send[0].content.includes(f.root), false);
  assert.equal(f.calls.send[0].content.includes('private-extra-context'), false);
  assert.equal(result.receipt.delivery, 'inline');
  assert.equal(result.receipt.entries.length, prompt.knowledge.length);
  assert.deepEqual(f.calls.close, ['help-session']);
  assert.deepEqual(await f.coreStore.readCore(), before);
});

test('distinct requested contexts reach the model; remote workspace state is not guessed locally', async (t) => {
  const f = await fixture(t, { getHealth: async () => ({ reachable: true, baseUrl: 'https://remote.example', status: 'ok' }) });
  const first = await f.service.help(request(), new AbortController().signal);
  const secondInput = request();
  secondInput.draft.target = { provider: 'codex', instance: null, model: null };
  secondInput.draft.cwd = f.root;
  const second = await f.service.help(secondInput, new AbortController().signal);
  assert.notEqual(first.advice, second.advice);
  assert.notEqual(first.receipt.observationDigest, second.receipt.observationDigest);
  assert.equal(JSON.parse(f.calls.send[1].content).observation.workspace.selection, 'remote_unverified');
  assert.equal(f.calls.create.length, 2);
});

test('disabled Catlas, missing knowledge and unreachable Runtime do not start an agent', async (t) => {
  const f = await fixture(t);
  await f.coreStore.updateCore((core) => ({ ...core, guideCat: { ...guideCat, status: 'dismissed' } }));
  assert.equal((await f.service.help(request(), new AbortController().signal)).reason, 'catlas_disabled');
  await f.coreStore.updateCore((core) => ({ ...core, guideCat }));
  await writeGuideCatAssistConfig(f.chatStatePath, {
    schemaVersion: 1, updatedAt: new Date().toISOString(),
    disabledSurfaceKeys: ['code:new:default:default'], deterministicSeed: null,
    curatedOverrides: {}, refreshPreferences: { runtimeRefreshEnabled: true, defaultTtlMs: null },
  });
  assert.equal((await f.service.help(request(), new AbortController().signal)).reason, 'catlas_disabled');
  assert.equal(f.calls.create.length, 0);
  const offline = await fixture(t, { getHealth: async () => ({ reachable: false }) });
  assert.equal((await offline.service.help(request(), new AbortController().signal)).reason, 'runtime_unavailable');
  await writeFile(offline.knowledgeFilePath, '{}');
  assert.equal((await offline.service.help(request(), new AbortController().signal)).reason, 'knowledge_unavailable');
  assert.equal(offline.calls.create.length, 0);
});

test('malformed model output, unknown knowledge references and tool use fall back and close sessions', async (t) => {
  for (const segments of [
    [{ kind: 'text', text: 'not JSON' }],
    [{ kind: 'text', text: JSON.stringify({ advice: 'Done', knowledgeIds: ['invented'] }) }],
    [{ kind: 'tool_use', text: 'write', toolName: 'write', toolId: '1' }],
  ]) {
    const f = await fixture(t, { sendMessage: async () => ({ segments }) });
    const result = await f.service.help(request(), new AbortController().signal);
    assert.equal(result.source, 'basic');
    assert.equal(result.receipt, null);
    assert.deepEqual(f.calls.close, ['help-session']);
  }
  assert.throws(() => parseCatlasAdvice('{"advice":"Done","knowledgeIds":[],"action":"edit"}', []));
});

test('a rejected provider/policy or transport failure never claims a model result', async (t) => {
  const f = await fixture(t, { createSession: async () => { throw new Error('Unsupported read-only policy'); } });
  assert.equal((await f.service.help(request({ locale: 'zh-TW' }), new AbortController().signal)).source, 'basic');
  assert.equal(f.calls.send.length, 0);
  const failed = await fixture(t, { sendMessage: async () => { throw new Error('Private upstream detail'); } });
  const result = await failed.service.help(request(), new AbortController().signal);
  assert.equal(JSON.stringify(result).includes('Private upstream detail'), false);
  assert.deepEqual(failed.calls.close, ['help-session']);
});

test('a changed Catlas model binding invalidates an in-flight result', async (t) => {
  const f = await fixture(t);
  const send = f.runtimeClient.sendMessage;
  f.runtimeClient.sendMessage = async (...args) => {
    await f.coreStore.updateCore((core) => ({ ...core, guideCat: {
      ...guideCat, executionTarget: { ...guideCat.executionTarget, model: 'changed' },
    } }));
    return send(...args);
  };
  assert.equal((await f.service.help(request(), new AbortController().signal)).reason, 'cancelled');
  assert.deepEqual(f.calls.close, ['help-session']);
});

test('the real Runtime HTTP adapter transmits knowledge bytes and parses an advice envelope', async (t) => {
  const f = await fixture(t);
  const requests = [];
  const runtime = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ url: req.url, body });
    if (req.url === '/sessions') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'http-help', providerName: 'claude', model: 'help-model', status: 'ready' }));
    } else if (req.url === '/sessions/http-help/messages') {
      const prompt = JSON.parse(body.message);
      assert.match(prompt.knowledge[0].content, /Cats Code starts/u);
      assert.equal(prompt.observation.surface, 'code:new');
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.end(JSON.stringify({ type: 'text', text: JSON.stringify({
        advice: 'Choose the intended project folder.', knowledgeIds: ['code.entry'],
      }) }) + '\n' + JSON.stringify({ type: 'result', usage: { inputTokens: 20, outputTokens: 10 } }) + '\n');
    } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); }
  });
  await new Promise((resolve) => runtime.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => runtime.close(resolve)));
  const knowledge = await loadCatlasKnowledge({ filePath: f.knowledgeFilePath, locale: 'en' });
  const result = await inferCatlasAdvice({
    runtimeClient: new CatsRuntimeClient(`http://127.0.0.1:${runtime.address().port}`),
    guideCat, locale: 'en', question: 'How do I start?', surface: 'code:new',
    observation: { surface: 'code:new' }, bundle: knowledge.bundle,
    entries: selectCatlasKnowledge(knowledge.bundle, ['workspace']), signal: new AbortController().signal,
  });
  assert.equal(result.advice, 'Choose the intended project folder.');
  assert.equal(result.receipt.sessionCleanup, 'closed');
  assert.equal(requests[0].body.workspaceAccess, 'read_only');
  assert.equal(requests.at(-1).url, '/sessions/http-help/close');
});

test('disabling assistance invalidates an in-flight result', async (t) => {
  const f = await fixture(t);
  const send = f.runtimeClient.sendMessage;
  f.runtimeClient.sendMessage = async (...args) => {
    await writeGuideCatAssistConfig(f.chatStatePath, {
      schemaVersion: 1, updatedAt: new Date().toISOString(),
      disabledSurfaceKeys: ['code:new:default:default'], deterministicSeed: null,
      curatedOverrides: {}, refreshPreferences: { runtimeRefreshEnabled: true, defaultTtlMs: null },
    });
    return send(...args);
  };
  assert.equal((await f.service.help(request(), new AbortController().signal)).reason, 'cancelled');
  assert.deepEqual(f.calls.close, ['help-session']);
});

test('timeout keeps admission occupied until a late-created session is closed', { timeout: 5_000 }, async (t) => {
  let releaseCreate;
  const created = new Promise((resolve) => { releaseCreate = resolve; });
  const f = await fixture(t, { createSession: async () => created }, { timeoutMs: 500 });
  t.after(() => releaseCreate({ id: 'late-session', provider: 'claude', model: 'help-model' }));
  const first = await f.service.help(request(), new AbortController().signal);
  assert.equal(first.reason, 'timeout');
  assert.equal((await f.service.help(request(), new AbortController().signal)).reason, 'busy');
  releaseCreate({ id: 'late-session', provider: 'claude', model: 'help-model' });
  for (let attempt = 0; attempt < 40 && f.calls.close.length === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.deepEqual(f.calls.cancel, ['late-session']);
  assert.deepEqual(f.calls.close, ['late-session']);
  assert.equal(f.calls.send.length, 0);
});

function waitForSendStart(sending, pending) {
  return Promise.race([sending, pending.then((result) => {
    assert.fail(`Expected a model turn to start; help returned ${result.reason}.`);
  })]);
}

test('cancellation setup fails promptly when incompatible knowledge prevents a model turn', { timeout: 5_000 }, async (t) => {
  const f = await fixture(t);
  const incompatible = { ...JSON.parse(sourceKnowledge), platformRange: '99.x' };
  await writeFile(f.knowledgeFilePath, JSON.stringify(incompatible));
  const pending = f.service.help(request(), new AbortController().signal);
  await assert.rejects(waitForSendStart(new Promise(() => {}), pending), /help returned knowledge_unavailable/u);
  assert.equal(f.calls.create.length, 0);
  assert.equal(f.calls.send.length, 0);
});

test('cancellation cancels an active turn and still closes its owned session', { timeout: 5_000 }, async (t) => {
  let finish;
  let started;
  const sending = new Promise((resolve) => { started = resolve; });
  const message = new Promise((resolve) => { finish = resolve; });
  const f = await fixture(t, { sendMessage: async () => { started(); return message; } });
  const controller = new AbortController();
  const pending = f.service.help(request(), controller.signal);
  t.after(async () => {
    controller.abort();
    finish({ segments: [] });
    await pending;
  });
  await waitForSendStart(sending, pending);
  controller.abort();
  assert.equal((await pending).reason, 'cancelled');
  for (let attempt = 0; attempt < 40 && !f.calls.close.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(f.calls.cancel.includes('help-session'));
  assert.deepEqual(f.calls.close, ['help-session']);
  finish({ segments: [] });
});

test('Code help API validates input, stays protected and returns uncached contextual advice', async (t) => {
  const f = await fixture(t);
  const server = createServer(async (req, res) => {
    const handled = await routeCodeApi({ request: req, response: res,
      url: new URL(req.url, 'http://localhost'), method: req.method,
      dependencies: { coreStore: f.coreStore, runtimeClient: f.runtimeClient,
        config: {}, catlasHelp: f.service },
    });
    if (!handled) { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/code/catlas/help`;
  assert.equal((await fetch(url)).status, 405);
  const invalid = request(); invalid.draft.policy.permissionMode = 'skip';
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(invalid) })).status, 400);
  assert.equal(f.calls.create.length, 0);
  assert.equal((await fetch(url, {
    method: 'POST', body: JSON.stringify(request({ locale: ['en'] })),
  })).status, 400);
  const response = await fetch(url, { method: 'POST', body: JSON.stringify(request()) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).source, 'model');
  for (const phase of ['pre_setup', 'post_setup', 'repair']) {
    assert.equal(classifyPlatformAuthRoute({ pathname: '/api/code/catlas/help', method: 'POST', phase }).access, 'protected');
  }
});
