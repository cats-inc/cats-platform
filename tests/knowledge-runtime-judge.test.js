import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';
import { digest, readJson, writeNew } from '../tools/knowledge-practice/artifacts.mjs';
import { createRuntimeKnowledgeJudge } from '../tools/knowledge-practice/runtimeJudge.mjs';

const target = { provider: 'fixture', instance: 'cli/public', model: 'public-model' };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-runtime-judge-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-runtime-judge-'))); await rm(root, { recursive: true, force: true });
  });
  const resetId = randomUUID(), resetRoot = join(root, 'resets', resetId), controller = new AbortController();
  await mkdir(resetRoot, { recursive: true });
  const response = { resetId, locale: 'zh-TW', question: '如何開始？',
    observation: { surface: 'code:new', observedAt: '2026-09-26T00:00:00Z', runtimeReachable: true,
      draftTarget: null, targetAvailability: 'unselected', effectiveSessionAccess: 'not_started',
      workspace: { selection: 'unselected', inspectionHost: 'platform', gitStatus: 'unknown' },
      requestedPolicy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' } },
    advice: '😀先選擇 coding target，再檢查存取權限。', knowledgeIds: ['code.entry'] };
  const input = { response, responseDigest: digest(response), criteria: [{ id: 'useful', criterion: 'Describe a supported first action.' }],
    signal: controller.signal };
  const session = { id: 'owned-reviewer', provider: target.provider, providerName: target.provider, model: target.model,
    providerTarget: { resolved: true, provider: target.provider, target: target.instance },
    workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default',
    skills: { strict: true, requestedSkills: [], appliedSkillIds: [] } };
  const model = { responseDigest: input.responseDigest, decisions: [{ id: 'useful', verdict: 'pass',
    rationale: 'The answer gives a first action.', evidenceQuotes: ['先選擇 coding target'] }] };
  const transport = () => ({ tokensUsed: 19, segments: [{ kind: 'text', text: JSON.stringify(model) }] });
  const calls = [], observed = [];
  const options = { evaluationRoot: root, target, reviewerId: 'independent-reviewer', authorId: 'author',
    runtimeClient: {
      async createSession(value) { calls.push(['create', value]); return session; },
      async observeSession(sessionId) { assert.equal(sessionId, session.id); calls.push(['observe']); return { session }; },
      async sendMessage(sessionId, content, settings) {
        assert.equal(sessionId, session.id); calls.push(['send', JSON.parse(content), settings]); return transport();
      },
      async cancelSession(sessionId) { assert.equal(sessionId, session.id); calls.push(['cancel']); },
      async closeSession(sessionId) { assert.equal(sessionId, session.id); calls.push(['close']); },
    },
    async observeCleanup(value) { observed.push(value); return { status: 'complete', evidenceRefs: ['fixture:independent-process-observation'] }; },
  };
  return { root, resetRoot, resetId, input, controller, session, model, transport, calls, observed, options,
    create: () => createRuntimeKnowledgeJudge(options) };
}

test('independent Runtime judge binds a fresh read-only session and converts exact quotes to UTF-16 spans', async t => {
  const f = await setup(t), reviewer = f.create(), result = await reviewer.judge(f.input);
  assert.equal(result.reviewerId, 'independent-reviewer'); assert.equal(result.responseDigest, f.input.responseDigest);
  assert.equal(result.usageTokens, 19); assert.equal(result.decisions[0].verdict, 'pass');
  assert.deepEqual(result.decisions[0].evidenceSpans, [{ start: 2, end: 19 }]);
  const create = f.calls.find(row => row[0] === 'create')[1];
  assert.deepEqual({ provider: create.provider, instance: create.instance, model: create.model }, target);
  assert.equal(create.workspaceKind, 'sandbox'); assert.equal(create.workspaceAccess, 'read_only');
  assert.equal(create.permissionMode, 'default'); assert.equal(create.sharingMode, 'isolated');
  assert.deepEqual(create.skills, { requestedSkills: [], strict: true });
  const sent = f.calls.find(row => row[0] === 'send');
  assert.deepEqual(Object.keys(sent[1]).sort(), ['criteria', 'response', 'responseDigest']);
  assert.equal(sent[2].instructions, create.instructions);
  assert.equal(f.calls.filter(row => row[0] === 'observe').length, 2);
  assert.equal(f.observed[0].sendSettled, true); assert.equal(f.observed[0].closeAcknowledged, true);
  assert.equal((await reviewer.confirmCleanup({ resetId: f.resetId })).status, 'complete');
  const receipt = await readJson(join(f.resetRoot, 'judge/result.json'));
  assert.equal(receipt.settled, true); assert.equal(receipt.usageTokens, 19); assert.equal(receipt.cleanup, 'complete');
  await assert.rejects(reviewer.judge(f.input), /already consumed/u);
  await assert.rejects(f.create().judge(f.input), { code: 'EEXIST' });
  assert.equal(f.calls.filter(row => row[0] === 'send').length, 1);
});

test('self-review, changed digest and author labels are rejected before any Runtime call', async t => {
  const f = await setup(t);
  assert.throws(() => createRuntimeKnowledgeJudge({ ...f.options, reviewerId: 'author' }));
  for (const change of [{ responseDigest: digest('stale') },
    { response: { ...f.input.response, phase: 'candidate' } }, { criteria: [f.input.criteria[0], f.input.criteria[0]] }]) {
    await assert.rejects(f.create().judge({ ...f.input, ...change }));
  }
  assert.deepEqual(f.calls, []);
});

for (const bad of ['model-usage', 'stale', 'missing-criterion', 'indeterminate', 'unknown-quote', 'ambiguous-quote', 'tool']) {
  test(`invalid native judgment ${bad} retains its measured usage without passing`, async t => {
    const f = await setup(t);
    if (bad === 'model-usage') f.model.usageTokens = 0;
    if (bad === 'stale') f.model.responseDigest = digest('stale');
    if (bad === 'missing-criterion') f.model.decisions = [];
    if (bad === 'indeterminate') f.model.decisions[0].verdict = 'indeterminate';
    if (bad === 'unknown-quote') f.model.decisions[0].evidenceQuotes = ['unsupported text'];
    if (bad === 'ambiguous-quote') {
      f.input.response.advice += f.input.response.advice;
      f.input.responseDigest = digest(f.input.response); f.model.responseDigest = f.input.responseDigest;
    }
    if (bad === 'tool') f.options.runtimeClient.sendMessage = async () => ({ tokensUsed: 19, segments: [{ kind: 'tool_use' }] });
    const reviewer = f.create(), result = await reviewer.judge(f.input);
    assert.equal(result.usageTokens, 19); assert.deepEqual(result.decisions, []);
    assert.equal(reviewer.inspect(f.resetId).usageTokens, 19);
    assert.equal((await readJson(join(f.resetRoot, 'judge/usage.json'))).usageTokens, 19);
  });
}

for (const tokens of [0, undefined]) test(`unmeasured native judge usage stays unknown (${tokens})`, async t => {
  const f = await setup(t); f.options.runtimeClient.sendMessage = async () => ({ ...f.transport(), tokensUsed: tokens });
  const result = await f.create().judge(f.input);
  assert.equal(result.usageTokens, null); assert.deepEqual(result.decisions, []);
});

for (const stage of ['before', 'after']) test(`changed observed delivery ${stage} sending cannot pass`, async t => {
  const f = await setup(t); let observations = 0;
  f.options.runtimeClient.observeSession = async () => ({ session: ++observations === (stage === 'before' ? 1 : 2)
    ? { ...f.session, model: 'foreign-model' } : f.session });
  const result = await f.create().judge(f.input);
  assert.deepEqual(result.decisions, []); assert.equal(result.usageTokens, stage === 'before' ? 0 : 19);
  assert.equal(f.calls.filter(row => row[0] === 'send').length, stage === 'before' ? 0 : 1);
});

test('close acknowledgement cannot replace independent cleanup evidence', async t => {
  const f = await setup(t); f.options.observeCleanup = async () => ({ status: 'incomplete', evidenceRefs: ['fixture:still-observed'] });
  const reviewer = f.create(), result = await reviewer.judge(f.input);
  assert.equal(result.usageTokens, 19); assert.deepEqual(result.decisions, []);
  assert.equal(reviewer.inspect(f.resetId).closeAcknowledged, true);
  assert.equal((await reviewer.confirmCleanup({ resetId: f.resetId })).status, 'incomplete');
});

for (const stage of ['create', 'send']) test(`parent retains a late ${stage} outcome after cancellation and fences more inference`, async t => {
  const f = await setup(t), started = deferred(), pending = deferred();
  f.options.runtimeClient[stage === 'create' ? 'createSession' : 'sendMessage'] = async () => { started.resolve(); return pending.promise; };
  const reviewer = f.create(), judging = reviewer.judge(f.input);
  await started.promise; f.controller.abort();
  assert.equal((await reviewer.confirmCleanup({ resetId: f.resetId })).status, 'incomplete');
  assert.equal(reviewer.inspect(f.resetId).settled, false);
  pending.resolve(stage === 'create' ? f.session : f.transport());
  const result = await judging;
  assert.deepEqual(result.decisions, []); assert.equal(result.usageTokens, stage === 'create' ? 0 : 19);
  assert.equal(f.calls.filter(row => row[0] === 'send').length, 0);
  assert.equal(f.calls.filter(row => row[0] === 'cancel').length, 1);
  assert.equal(f.calls.filter(row => row[0] === 'close').length, 1);
  assert.equal(reviewer.inspect(f.resetId).sessionId, f.session.id);
  assert.equal(reviewer.inspect(f.resetId).settled, true);
});

test('rejected creation stays unresolved even if a point-in-time observer reports absence', async t => {
  const f = await setup(t); f.options.runtimeClient.createSession = async () => { throw new Error('Transport failed'); };
  const reviewer = f.create(), result = await reviewer.judge(f.input);
  assert.deepEqual(result.decisions, []); assert.equal(reviewer.inspect(f.resetId).sessionId, null);
  assert.equal((await reviewer.confirmCleanup({ resetId: f.resetId })).status, 'incomplete');
  assert.ok((await readJson(join(f.resetRoot, 'judge/intent.json'))).requestId);
});

test('final receipt failure preserves usage but blocks completion and replay', async t => {
  const f = await setup(t);
  f.options.runtimeClient.sendMessage = async () => {
    await writeNew(join(f.resetRoot, 'judge/result.json'), { occupied: true }); return f.transport();
  };
  const reviewer = f.create(), result = await reviewer.judge(f.input);
  assert.equal(result.usageTokens, 19); assert.deepEqual(result.decisions, []);
  assert.equal(reviewer.inspect(f.resetId).durable, false);
  assert.equal((await reviewer.confirmCleanup({ resetId: f.resetId })).status, 'incomplete');
  await assert.rejects(f.create().judge(f.input), { code: 'EEXIST' });
});

test('cancellation during the final result flush clears decisions and retains usage', async t => {
  const f = await setup(t), originalOpen = fsPromises.open;
  t.mock.method(fsPromises, 'open', async (...args) => {
    const fd = await originalOpen(...args);
    if (args[0] === join(f.resetRoot, 'judge/result.json')) {
      const sync = fd.sync.bind(fd);
      t.mock.method(fd, 'sync', async () => { await sync(); f.controller.abort(); });
    }
    return fd;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = await f.create().judge(f.input);
  assert.equal(f.controller.signal.aborted, true);
  assert.equal(result.usageTokens, 19); assert.deepEqual(result.decisions, []);
});

test('a complete negative judgment needs no quote and retains its measured usage', async t => {
  const f = await setup(t);
  f.model.decisions[0] = { id: 'useful', verdict: 'fail', rationale: 'Required first action is missing.', evidenceQuotes: [] };
  const result = await f.create().judge(f.input);
  assert.equal(result.usageTokens, 19);
  assert.deepEqual(result.decisions, [{ id: 'useful', verdict: 'fail',
    rationale: 'Required first action is missing.', evidenceSpans: [] }]);
});

test('real Runtime client transports fresh judge input and metered NDJSON through mocked HTTP only', async t => {
  const f = await setup(t), urls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    urls.push(url);
    if (url === 'http://runtime-fixture.invalid/sessions') return Response.json(f.session);
    if (url.endsWith('/observe')) return Response.json({ session: f.session });
    if (url.endsWith('/messages')) {
      const body = JSON.parse(options.body), sent = JSON.parse(body.message);
      assert.equal(sent.responseDigest, f.input.responseDigest); assert.equal(sent.response.resetId, f.resetId);
      return new Response(JSON.stringify({ type: 'result', text: JSON.stringify(f.model),
        usage: { inputTokens: 12, outputTokens: 7 } }) + '\n');
    }
    if (url.endsWith('/close') && options.method === 'POST') return Response.json({ ok: true });
    assert.fail(`Unexpected mocked Runtime operation: ${options.method}`);
  });
  f.options.runtimeClient = new CatsRuntimeClient('http://runtime-fixture.invalid');
  const result = await f.create().judge(f.input);
  assert.equal(result.usageTokens, 19); assert.equal(result.decisions.length, 1);
  assert.equal(urls.filter(url => url.endsWith('/messages')).length, 1);
  assert.equal(urls.filter(url => url.endsWith('/observe')).length, 2);
});
