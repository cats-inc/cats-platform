import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { inspectLocalKnowledge, mutateLocalKnowledge } from '../build/server/platform/knowledge/localKnowledge.js';
import { loadCatlasKnowledge } from '../build/server/platform/catlas/knowledge.js';
import { inferCatlasAdvice } from '../build/server/platform/catlas/inference.js';
import { loadOrchestratorKnowledge } from '../build/server/products/chat/state/orchestratorKnowledge.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, buildChannelView } from '../build/server/products/chat/state/model/index.js';
import { routeCodeKnowledgeApi } from '../build/server/products/code/api/knowledgeRoutes.js';

async function fixture(t) {
  const platformDir = await mkdtemp(join(tmpdir(), 'cats-local-knowledge-'));
  t.after(async () => { assert.ok(platformDir.startsWith(join(tmpdir(), 'cats-local-knowledge-'))); await rm(platformDir, { recursive: true, force: true }); });
  return { platformDir };
}
async function submit(options, target = 'catlas') {
  const state = await inspectLocalKnowledge(options), entry = state.targets.find(row => row.target === target).entries[0];
  return mutateLocalKnowledge({ action: 'submit', revision: state.revision, target, entryId: entry.id,
    content: { en: entry.content.en + ' Local reviewed lesson.', 'zh-TW': entry.content['zh-TW'] + ' 本機人工檢查的知識。' }, note: 'Isolated test' }, options);
}
const adopt = (state, options) => mutateLocalKnowledge({ action: 'adopt', revision: state.revision,
  id: state.drafts[0].id, confirm: 'manual-local-unverified' }, options);

test('submit is inert; adoption reaches actual Catlas input with provenance; revoke restores bundled knowledge', async t => {
  const options = await fixture(t);
  const before = await loadCatlasKnowledge({ ...options, locale: 'en' });
  const draft = await submit(options);
  assert.deepEqual(await loadCatlasKnowledge({ ...options, locale: 'en' }), before);
  const active = await adopt(draft, options);
  const after = await loadCatlasKnowledge({ ...options, locale: 'en' });
  const zh = await loadCatlasKnowledge({ ...options, locale: 'zh-TW' });
  assert.match(after.bundle.entries[0].content, /Local reviewed lesson/u);
  assert.match(zh.bundle.entries[0].content, /本機人工/u);
  assert.equal(zh.bundle.digest, after.bundle.digest);
  assert.notEqual(after.bundle.digest, before.bundle.digest);
  assert.notEqual(after.bundle.entries[0].digest, before.bundle.entries[0].digest);
  assert.equal(after.bundle.entries[0].verifiedAt, '');
  assert.equal(after.bundle.entries[0].adoption.kind, 'manual-local-unverified');
  assert.deepEqual(after.bundle.entries.slice(1), before.bundle.entries.slice(1));
  let delivered;
  const runtimeClient = {
    async createSession() { return { id: 'local-help', provider: 'claude', model: 'fixture' }; },
    async sendMessage(_id, content) { delivered = JSON.parse(content); return { segments: [{ kind: 'text', text: JSON.stringify({ advice: 'Read the local lesson.', knowledgeIds: [after.bundle.entries[0].id] }) }] }; },
    async closeSession() {}, async cancelSession() {},
  };
  await inferCatlasAdvice({ runtimeClient, guideCat: { id: 'guide', executionTarget: { provider: 'claude', model: 'fixture' } },
    locale: 'en', question: 'Help', surface: 'code:new', observation: {}, bundle: after.bundle,
    entries: [after.bundle.entries[0]], signal: new AbortController().signal });
  assert.equal(delivered.knowledge[0].adoption.kind, 'manual-local-unverified');
  assert.match(delivered.knowledge[0].content, /Local reviewed lesson/u);
  await mutateLocalKnowledge({ action: 'revoke', revision: active.revision, id: active.drafts[0].id }, options);
  assert.deepEqual(await loadCatlasKnowledge({ ...options, locale: 'en' }), before);
});

test('Orchestrator actual context receives only its adopted entry', async t => {
  const options = await fixture(t);
  let state = createDefaultChatState();
  state = createChannel(state, { title: 'Local knowledge', topic: 'Fixture', originSurface: 'chat', roomMode: 'chat_channel', responseLanguage: 'en' });
  const input = { ...options, channel: buildChannelView(state, state.selectedChannelId), body: 'Help', surface: 'chat-visible', target: { provider: 'claude', model: 'fixture' } };
  const before = await loadOrchestratorKnowledge(input);
  await adopt(await submit(options, 'orchestrator'), options);
  const after = await loadOrchestratorKnowledge(input);
  assert.notEqual(after.contextDigest, before.contextDigest);
  assert.ok(after.entries.some(row => row.adoption?.kind === 'manual-local-unverified' && row.content.includes('Local reviewed lesson.')));
  const baseline = await loadOrchestratorKnowledge({ ...input, filePath: resolve('config/orchestrator-knowledge.json') });
  assert.deepEqual(baseline, before);
});

test('explicit evaluator files ignore local adoption and stale revisions cannot write', async t => {
  const options = await fixture(t), draft = await submit(options);
  const active = await adopt(draft, options);
  await assert.rejects(adopt(draft, options), /Knowledge changed/u);
  const explicit = await loadCatlasKnowledge({ ...options, filePath: resolve('config/catlas-knowledge.json'), locale: 'en' });
  assert.ok(!explicit.bundle.entries.some(row => row.adoption));
  const revisions = await Promise.allSettled([1, 2].map(() => mutateLocalKnowledge({ action: 'revoke', revision: active.revision, id: active.drafts[0].id }, options)));
  assert.equal(revisions.filter(row => row.status === 'fulfilled').length, 1);
});

test('bundled version changes suspend overrides and invalidate old review', async t => {
  const options = await fixture(t); options.bundleDir = join(options.platformDir, 'bundles');
  await mkdir(options.bundleDir);
  for (const target of ['catlas', 'orchestrator']) await copyFile(resolve(`config/${target}-knowledge.json`), join(options.bundleDir, `${target}-knowledge.json`));
  const active = await adopt(await submit(options), options);
  const path = join(options.bundleDir, 'catlas-knowledge.json');
  const bytes = await readFile(path, 'utf8'); await writeFile(path, bytes + '\n');
  const changed = await inspectLocalKnowledge(options);
  assert.equal(changed.drafts[0].stale, true); assert.equal(changed.drafts[0].active, false);
  assert.equal(changed.targets[0].entries[0].activeId, null);
  await assert.rejects(adopt(active, options), /Knowledge changed/u);
});

test('failed backup/write keeps previous state; malformed store fails editing and consumer uses bundle', async t => {
  const options = await fixture(t), draft = await submit(options);
  const path = join(options.platformDir, 'knowledge/contributions.json');
  const previous = await readFile(path, 'utf8');
  await rm(path + '.bak'); await mkdir(path + '.bak'); await writeFile(join(path + '.bak', 'occupied'), 'fixture');
  await assert.rejects(adopt(draft, options));
  assert.equal(await readFile(path, 'utf8'), previous);
  await writeFile(path, '{invalid');
  await assert.rejects(inspectLocalKnowledge(options), /damaged/u);
  assert.ok(!(await loadCatlasKnowledge({ ...options, locale: 'en' })).bundle.entries.some(row => row.adoption));
  await writeFile(path, previous);
  assert.deepEqual(await inspectLocalKnowledge(options), draft);
});

test('blank/oversized text, unknown entries and missing confirmation cannot adopt', async t => {
  const options = await fixture(t), state = await inspectLocalKnowledge(options);
  for (const content of [{ en: '', 'zh-TW': '資料' }, { en: 'x'.repeat(4001), 'zh-TW': '資料' }]) {
    await assert.rejects(mutateLocalKnowledge({ action: 'submit', revision: state.revision, target: 'catlas', entryId: 'code.entry', content }, options));
  }
  await assert.rejects(mutateLocalKnowledge({ action: 'submit', revision: state.revision, target: 'catlas', entryId: 'invented' }, options));
  const draft = await submit(options);
  await assert.rejects(mutateLocalKnowledge({ action: 'adopt', revision: draft.revision, id: draft.drafts[0].id }, options), /Review/u);
});

test('near-limit multibyte state rejects growth before modifying primary or backup', async t => {
  const options = await fixture(t), initial = await submit(options);
  const sample = initial.drafts[0];
  const state = { schemaVersion: 1, active: {}, drafts: Array.from({ length: 99 }, () => ({
    id: randomUUID(), target: sample.target, entryId: sample.entryId, bundleDigest: sample.bundleDigest,
    before: { en: '界'.repeat(1700), 'zh-TW': '界'.repeat(1700) },
    content: { en: '界'.repeat(1700), 'zh-TW': '界'.repeat(1700) }, note: '', createdAt: sample.createdAt,
  })) };
  const serialize = () => JSON.stringify(state, null, 2) + '\n';
  const limit = 2 * 1024 * 1024;
  for (const draft of state.drafts) {
    const remaining = limit - 256 - Buffer.byteLength(serialize());
    if (remaining <= 0) break;
    draft.note = 'x'.repeat(Math.min(1000, remaining));
  }
  const bytes = serialize(); assert.equal(Buffer.byteLength(bytes), limit - 256);
  const path = join(options.platformDir, 'knowledge/contributions.json');
  const backup = await readFile(path + '.bak', 'utf8');
  await writeFile(path, bytes);
  await assert.rejects(submit(options), /storage limit/u);
  assert.equal(await readFile(path, 'utf8'), bytes);
  assert.equal(await readFile(path + '.bak', 'utf8'), backup);
});

test('HTTP entry requires owner/admin and supports bounded submit/adopt/revoke', async t => {
  const options = await fixture(t);
  const server = createServer(async (request, response) => {
    await routeCodeKnowledgeApi({ request, response, url: new URL(request.url, 'http://localhost'), method: request.method,
      auth: request.headers['x-fixture-admin'] ? { principal: { membership: { roles: ['owner'] } } } : undefined,
      dependencies: { config: { platformDir: options.platformDir } } });
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => server.close(done)));
  const url = `http://127.0.0.1:${server.address().port}/api/code/knowledge`;
  assert.equal((await fetch(url)).status, 403);
  const headers = { 'x-fixture-admin': '1', 'content-type': 'application/json' };
  const initial = await (await fetch(url, { headers })).json();
  const entry = initial.targets[0].entries[0];
  const post = async body => { const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(response.status, 200); return response.json(); };
  const draft = await post({ action: 'submit', revision: initial.revision, target: 'catlas', entryId: entry.id, content: { en: 'Owner contribution.', 'zh-TW': '使用者貢獻。' } });
  const active = await post({ action: 'adopt', revision: draft.revision, id: draft.drafts[0].id, confirm: 'manual-local-unverified' });
  assert.equal(active.drafts[0].active, true);
  const restored = await post({ action: 'revoke', revision: active.revision, id: active.drafts[0].id });
  assert.deepEqual(restored.targets[0].entries[0].content, entry.content);
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(41 * 1024) })).status, 413);
});
