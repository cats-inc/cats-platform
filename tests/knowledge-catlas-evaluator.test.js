import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { loadCatlasKnowledge } from '../build/server/platform/catlas/knowledge.js';
import { assembleProductKnowledgeContext } from '../build/server/platform/knowledge/productKnowledge.js';
import { validateRuntimeSessionPolicyInput } from '../build/server/shared/runtimeSessionPolicy.js';
import { createCatlasEvaluator } from '../tools/knowledge-practice/catlasEvaluator.mjs';
import { digest, readJson, writeNew } from '../tools/knowledge-practice/artifacts.mjs';

const topics = ['execution', 'workspace', 'permissions', 'recovery'];
const advice = 'Choose a coding target, then select your project folder.';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function retained(file) {
  for (let retry = 0; retry < 200; retry++) {
    try { return await readJson(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(10);
  }
  assert.fail('Late reconciliation receipt was not retained.');
}
async function fixture(t, locale = 'en') {
  const root = await mkdtemp(join(tmpdir(), 'cats-evaluator-'));
  t.after(async () => {
    assert.ok(root.startsWith(join(tmpdir(), 'cats-evaluator-')));
    await rm(root, { recursive: true, force: true });
  });
  const resetId = randomUUID(), fixtureRoot = join(root, 'resets', resetId);
  await mkdir(fixtureRoot, { recursive: true });
  const knowledge = await loadCatlasKnowledge({ filePath: new URL('../config/catlas-knowledge.json', import.meta.url), locale });
  assert.equal(knowledge.status, 'ready');
  const input = { question: locale === 'en' ? 'How do I begin?' : '我該如何開始？', rubricId: 'public.fixture',
    observation: { surface: 'code:new', observedAt: '2026-09-26T00:00:00Z', runtimeReachable: true,
      draftTarget: null, targetAvailability: 'unselected',
      workspace: { selection: 'unselected', inspectionHost: 'platform', gitStatus: 'unknown' },
      requestedPolicy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' },
      effectiveSessionAccess: 'not_started' } };
  const context = assembleProductKnowledgeContext(knowledge, { role: 'catlas', surface: 'code-help', locale,
    goal: input.question, scope: input.observation, topics, operations: [] });
  const guideCat = { id: 'guide-cat-primary', name: 'Catlas', status: 'active',
    executionTarget: { provider: 'fixture', instance: 'cli/public', model: 'fixture-model' }, modelSelection: null };
  const session = { id: 'public-session', provider: 'fixture', providerName: 'fixture', model: 'fixture-model',
    providerTarget: { resolved: true, provider: 'fixture', target: 'cli/public' },
    workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default',
    skills: { strict: true, requestedSkills: [], appliedSkillIds: [] } };
  const calls = { create: [], send: [], close: [], cancel: [], judge: [], cleanup: [] };
  const runtimeClient = {
    async createSession(value) {
      calls.create.push(value); assert.equal(validateRuntimeSessionPolicyInput(value), null);
      assert.equal(value.workspaceAccess, 'read_only'); assert.equal(value.sharingMode, 'isolated');
      assert.deepEqual(value.skills, { requestedSkills: [], strict: true });
      assert.equal(value.cwd, undefined);
      return session;
    },
    async observeSession() { return { session }; },
    async sendMessage(sessionId, content, options) {
      const prompt = JSON.parse(content); calls.send.push({ sessionId, prompt, options });
      return { segments: [{ kind: 'text', text: JSON.stringify({ advice, knowledgeIds: ['code.entry'] }) }], tokensUsed: 42 };
    },
    async cancelSession(value) { calls.cancel.push(value); },
    async closeSession(value) { calls.close.push(value); },
  };
  const options = { evaluationRoot: root, runtimeClient, guideCat, authorId: 'public-author', reviewerId: 'public-reviewer',
    async loadKnowledge(bundleDigest, requestedLocale) {
      assert.equal(bundleDigest, knowledge.bundle.digest); assert.equal(requestedLocale, locale); return knowledge;
    },
    async resolveRubric(rubricId) { assert.equal(rubricId, input.rubricId); return [{ id: 'useful', criterion: 'Public fixture criterion.' }]; },
    async judge(value) {
      calls.judge.push(value);
      return { reviewerId: 'public-reviewer', responseDigest: value.responseDigest, usageTokens: 7,
        decisions: [{ id: 'useful', verdict: 'pass', rationale: 'Public fixture decision, not a quality measurement.',
          evidenceSpans: [{ start: 0, end: value.response.advice.length }] }] };
    },
    async confirmCleanup(value) {
      calls.cleanup.push(value);
      return { status: 'complete', evidenceRefs: [`fixture:${value.stage}-cleanup`] };
    },
  };
  const controller = new AbortController();
  const args = { fixture: input, fixtureRoot, resetId, context, signal: controller.signal };
  return { root, fixtureRoot, resetId, args, options, calls, session, controller,
    run: () => createCatlasEvaluator(options)(args) };
}

for (const locale of ['en', 'zh-TW']) test(`actual Catlas inference and independent grading are bound and measured (${locale})`, async t => {
  const f = await fixture(t, locale), result = await f.run();
  assert.deepEqual(result.observed, { responseValid: true, semantic: { useful: true } });
  assert.equal(result.usageTokens, 49); assert.equal(result.cleanup, 'complete');
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.send.length, 1); assert.equal(f.calls.close.length, 1);
  assert.deepEqual(f.calls.send[0].prompt.observation, f.args.fixture.observation);
  assert.equal(f.calls.send[0].prompt.question, f.args.fixture.question);
  assert.deepEqual(f.calls.send[0].prompt.knowledge.map(entry => entry.id),
    ['code.entry', 'code.execution', 'code.workspace', 'code.permissions', 'code.recovery']);
  assert.ok(!JSON.stringify(f.calls.send).includes('Public fixture criterion'));
  assert.deepEqual(Object.keys(f.calls.judge[0].response).sort(),
    ['advice', 'knowledgeIds', 'locale', 'observation', 'question', 'resetId']);
  assert.equal(f.calls.judge[0].responseDigest, digest(f.calls.judge[0].response));
  assert.deepEqual(f.calls.cleanup.map(value => value.stage), ['catlas', 'reviewer']);
  const receipt = await readJson(join(f.fixtureRoot, 'catlas-result.json'));
  assert.equal(receipt.receipt.delivery, 'inline'); assert.equal(receipt.receipt.sessionCleanup, 'closed');
  assert.deepEqual(receipt.usage, { catlasTokens: 42, reviewerTokens: 7 });
  assert.equal(receipt.selectedEntries.length, 5);
  await assert.rejects(f.run(), { code: 'EEXIST' });
  assert.equal(f.calls.create.length, 1, 'A retained intent must prevent inference replay.');
});

test('preflight rejects impossible or unbound observations before a session is created', async t => {
  const f = await fixture(t);
  for (const mutate of [
    value => { value.fixture.observation.requestedPolicy.permissionMode = 'skip'; },
    value => { value.fixture.observation.requestedPolicy.workspaceKind = 'invented'; },
    value => { value.fixture.observation.runtimeReachable = false; },
    value => { value.fixture.observation.targetAvailability = 'ok'; },
    value => { value.fixture.observation.draftTarget = { provider: 'fixture', instance: null, model: null }; },
    value => { value.fixture.observation.effectiveSessionAccess = 'read_write'; },
    value => { value.fixture.observation.workspace.gitStatus = 'clean'; },
    value => { value.fixture.observation.processStopped = true; },
    value => { value.context.goal = 'A different question'; },
    value => { value.context.scope = {}; },
    value => { value.context.entries[0].content = 'Changed admitted guidance'; },
    value => { value.context.operations = [{ id: 'invented', version: '1.0' }]; },
    value => { value.fixtureRoot = f.root; },
  ]) {
    const args = { ...f.args, fixture: structuredClone(f.args.fixture), context: structuredClone(f.args.context) };
    mutate(args); await assert.rejects(createCatlasEvaluator(f.options)(args));
  }
  assert.equal(f.calls.create.length, 0);
  assert.throws(() => createCatlasEvaluator({ ...f.options, reviewerId: f.options.authorId }), /Author cannot/u);
});

test('concurrent attempts with one reset cannot duplicate Runtime execution', async t => {
  const f = await fixture(t);
  const attempts = await Promise.allSettled([f.run(), f.run()]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(value => value.status === 'rejected').length, 1);
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.send.length, 1);
});

for (const failure of ['malformed', 'tool', 'private', 'unknown-entry', 'unknown-usage', 'changed-delivery']) {
  test(`invalid Catlas ${failure} retains spend and cannot reach the judge`, async t => {
    const f = await fixture(t);
    const send = f.options.runtimeClient.sendMessage;
    f.options.runtimeClient.sendMessage = async (...args) => {
      const response = await send(...args);
      if (failure === 'malformed') response.segments[0].text = 'not JSON';
      if (failure === 'tool') response.segments.push({ kind: 'tool_use', name: 'read_file', input: {} });
      if (failure === 'private') response.segments[0].text = JSON.stringify({ advice: 'Inspect C:/Users/private/project', knowledgeIds: ['code.entry'] });
      if (failure === 'unknown-entry') response.segments[0].text = JSON.stringify({ advice, knowledgeIds: ['invented'] });
      if (failure === 'unknown-usage') delete response.tokensUsed;
      if (failure === 'changed-delivery') f.session.workspace.access = 'read_write';
      return response;
    };
    const result = await f.run();
    assert.equal(result.observed.responseValid, false); assert.equal(f.calls.judge.length, 0);
    assert.equal(result.usageTokens, failure === 'unknown-usage' ? null : 42);
    assert.equal(result.cleanup, 'complete'); assert.equal(f.calls.close.length, 1);
  });
}

for (const failure of ['stale', 'wrong-reviewer', 'missing', 'duplicate', 'indeterminate', 'empty-evidence', 'bad-span', 'unknown-usage']) {
  test(`invalid semantic judgment (${failure}) cannot erase its measured usage`, async t => {
    const f = await fixture(t), judge = f.options.judge;
    f.options.judge = async value => {
      const result = await judge(value);
      if (failure === 'stale') result.responseDigest = digest('old-response');
      if (failure === 'wrong-reviewer') result.reviewerId = 'public-author';
      if (failure === 'missing') result.decisions = [];
      if (failure === 'duplicate') result.decisions.push(result.decisions[0]);
      if (failure === 'indeterminate') result.decisions[0].verdict = 'indeterminate';
      if (failure === 'empty-evidence') result.decisions[0].evidenceSpans = [];
      if (failure === 'bad-span') result.decisions[0].evidenceSpans[0].end = advice.length + 1;
      if (failure === 'unknown-usage') result.usageTokens = null;
      return result;
    };
    const result = await f.run();
    assert.equal(result.observed.responseValid, false); assert.equal(result.observed.semantic.useful, false);
    assert.equal(result.usageTokens, failure === 'unknown-usage' ? null : 49);
    assert.equal((await readJson(join(f.fixtureRoot, 'catlas-result.json'))).failure, 'semantic_judgment_incomplete');
  });
}

test('complete negative semantic decisions stay distinct from incomplete assessment', async t => {
  const f = await fixture(t), judge = f.options.judge;
  f.options.judge = async value => {
    const result = await judge(value); result.decisions[0].verdict = 'fail'; result.decisions[0].evidenceSpans = [];
    return result;
  };
  const result = await f.run();
  assert.deepEqual(result.observed, { responseValid: true, semantic: { useful: false } });
  assert.equal(result.usageTokens, 49);
});

for (const stage of ['catlas', 'reviewer']) test(`independent ${stage} cleanup is required beyond close acknowledgements`, async t => {
  const f = await fixture(t);
  f.options.confirmCleanup = async value => ({ status: value.stage === stage ? 'incomplete' : 'complete', evidenceRefs: ['fixture:unconfirmed'] });
  const result = await f.run();
  assert.equal(result.cleanup, 'incomplete'); assert.equal(f.calls.close.length, 1);
  assert.equal(f.calls.judge.length, stage === 'catlas' ? 0 : 1);
});

test('cancelled late session creation never sends and retains a cleanup request', async t => {
  const f = await fixture(t), creation = deferred(), started = deferred();
  f.options.runtimeClient.createSession = () => { started.resolve(); return creation.promise; };
  const pending = f.run(); await started.promise; f.controller.abort();
  const result = await pending;
  assert.equal(result.cleanup, 'incomplete'); assert.equal(result.observed.responseValid, false);
  assert.equal(result.usageTokens, 0); assert.equal(f.calls.send.length, 0);
  creation.resolve(f.session);
  const late = await retained(join(f.fixtureRoot, 'catlas-late-create.json'));
  assert.equal(late.sessionId, f.session.id); assert.equal(late.closeAcknowledged, true); assert.equal(late.cleanup, 'unconfirmed');
  assert.deepEqual(f.calls.cancel, [f.session.id]); assert.deepEqual(f.calls.close, [f.session.id]);
  assert.equal(f.calls.send.length, 0);
  assert.ok((await readJson(join(f.fixtureRoot, 'catlas-create.json'))).requestId);
});

test('cancelled send keeps unknown usage until late transport evidence arrives', async t => {
  const f = await fixture(t), transport = deferred(), started = deferred();
  f.options.runtimeClient.sendMessage = () => { started.resolve(); return transport.promise; };
  const pending = f.run(); await started.promise; f.controller.abort();
  const result = await pending;
  assert.equal(result.usageTokens, null); assert.equal(result.observed.responseValid, false);
  assert.equal(f.calls.judge.length, 0); assert.deepEqual(f.calls.cancel, [f.session.id]);
  transport.resolve({ segments: [{ kind: 'text', text: JSON.stringify({ advice, knowledgeIds: ['code.entry'] }) }], tokensUsed: 63 });
  assert.equal((await retained(join(f.fixtureRoot, 'catlas-usage.json'))).tokens, 63);
  assert.equal(result.usageTokens, null, 'A returned incomplete result cannot silently become accepted.');
});

test('cancelled pending judge keeps aggregate cleanup incomplete and retains late measured spend', async t => {
  const f = await fixture(t), grading = deferred(), started = deferred(), judge = f.options.judge;
  let input;
  f.options.judge = value => { input = value; started.resolve(); return grading.promise; };
  const pending = f.run(); await started.promise; f.controller.abort();
  const result = await pending;
  assert.equal(result.cleanup, 'incomplete'); assert.equal(result.usageTokens, null);
  assert.equal(result.observed.responseValid, false);
  const receipt = await readJson(join(f.fixtureRoot, 'catlas-result.json'));
  assert.equal(receipt.catlasCleanup, 'complete'); assert.equal(receipt.reviewerSettled, false);
  grading.resolve(await judge(input));
  assert.equal((await retained(join(f.fixtureRoot, 'assessment-usage.json'))).reviewerTokens, 7);
  await assert.rejects(readFile(join(f.fixtureRoot, 'assessment-result.json')), { code: 'ENOENT' });
  assert.equal(result.cleanup, 'incomplete');
});

test('failure to persist the final receipt retains known spend and invalidates completion', async t => {
  const f = await fixture(t);
  await writeNew(join(f.fixtureRoot, 'catlas-result.json'), { occupied: true });
  const result = await f.run();
  assert.equal(result.usageTokens, 49); assert.equal(result.observed.responseValid, false);
  assert.deepEqual(await readJson(join(f.fixtureRoot, 'catlas-result.json')), { occupied: true });
});
