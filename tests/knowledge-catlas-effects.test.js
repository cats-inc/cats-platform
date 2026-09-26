import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { createCatlasEffectClient } from '../tools/knowledge-practice/catlasEffectClient.mjs';
import { createCatlasEffectSupervisor } from '../tools/knowledge-practice/catlasEffects.mjs';
import { canonical, digest, readJson, readRecord, writeNew } from '../tools/knowledge-practice/artifacts.mjs';
import { createPreservationFixture } from '../tools/knowledge-practice/preservationFixture.mjs';
import { createCandidate } from '../tools/knowledge-practice/candidate.mjs';
import { admitPractice, evaluatePractice } from '../tools/knowledge-practice/practice.mjs';
import { verifyEvaluation } from '../tools/knowledge-practice/promotion.mjs';
import { CatsRuntimeClient } from '../build/server/runtime/client.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const importPath = name => JSON.stringify(pathToFileURL(join(project, name)).href);
const target = { provider: 'fixture', instance: 'cli/public', model: 'public-model' };
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
async function until(check) { for (let i = 0; i < 200; i++) { if (check()) return; await delay(5); } assert.fail('Expected parent observation did not arrive.'); }
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-parent-effects-'));
  const leases = [], workers = [];
  t.after(async () => {
    for (const worker of workers) await worker.terminate();
    for (const lease of leases) { await lease.seal('test_cleanup'); lease.port.close(); await lease.drain(2000); }
    assert.ok(root.startsWith(join(tmpdir(), 'cats-parent-effects-')));
    await rm(root, { recursive: true, force: true });
  });
  const resetId = randomUUID(), fixtureRoot = join(root, 'resets', resetId);
  await mkdir(fixtureRoot, { recursive: true });
  const input = { resetId, fixtureRoot, remainingTokens: 1000,
    context: { bundle: { digest: digest('public-knowledge') } }, fixture: { question: 'Public question', observation: {} } };
  const create = { ...target, workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default',
    sharingMode: 'isolated', skills: { requestedSkills: [], strict: true }, context: { metadata: {
      requestId: randomUUID(), knowledgeDigest: input.context.bundle.digest, observationDigest: digest('{}') } } };
  const session = { id: 'public-session', provider: target.provider, providerName: target.provider, model: target.model,
    providerTarget: { resolved: true, provider: target.provider, target: target.instance },
    workspace: { kind: 'sandbox', access: 'read_only' }, permissionMode: 'default',
    hydration: { trigger: 'create' }, inspection: { state: 'idle' } };
  const calls = [], reconciled = [];
  const options = { evaluationRoot: root, target,
    runtimeClient: {
      async createSession() { calls.push('create'); return session; },
      async observeSession() { return { session }; },
      async sendMessage() {
        calls.push('send'); return { tokensUsed: 42, segments: [{ kind: 'text', text: JSON.stringify({
          advice: 'Select a coding target.', knowledgeIds: ['code.entry'] }) }] };
      },
      async cancelSession() { calls.push('cancel'); },
      async closeSession() { calls.push('close'); },
    },
    async judge({ response, responseDigest }) {
      calls.push('judge'); return { responseDigest, reviewerId: 'public-reviewer', usageTokens: 7,
        decisions: [{ id: 'useful', verdict: 'pass', rationale: 'Public plumbing fixture.',
          evidenceSpans: [{ start: 0, end: response.advice.length }] }] };
    },
    async confirmCleanup() { return { status: 'complete', evidenceRefs: ['fixture:cleanup'] }; },
    async reconcile(value) { reconciled.push(value); return { status: 'complete', evidenceRefs: ['fixture:reconciled'] }; },
  };
  async function open() {
    const supervisor = createCatlasEffectSupervisor(options), lease = await supervisor.open(input);
    leases.push(lease);
    return { supervisor, lease, client: createCatlasEffectClient({ port: lease.port, resetId }) };
  }
  const send = client => client.runtimeClient.sendMessage(session.id,
    JSON.stringify({ question: input.fixture.question, observation: input.fixture.observation, knowledge: [] }), {});
  const cleanup = (client, stage) => client.confirmCleanup({ resetId, stage, sessionId: session.id });
  const grade = client => { const response = { resetId, advice: 'Select a coding target.' };
    return client.judge({ response, responseDigest: digest(response), criteria: [], signal: new AbortController().signal }); };
  return { root, input, create, session, options, calls, reconciled, leases, workers, open, send, cleanup, grade };
}

test('parent reserves inference effects before intent I/O and rejects duplicates, foreign sessions and replay', async t => {
  const f = await setup(t), { client, lease, supervisor } = await f.open();
  const results = await Promise.allSettled([client.runtimeClient.createSession(f.create), client.runtimeClient.createSession(f.create)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1); assert.deepEqual(f.calls, ['create']);
  await assert.rejects(client.runtimeClient.sendMessage('foreign', '{}', {})); assert.equal(f.calls.includes('send'), false);
  await f.send(client); await f.cleanup(client, 'catlas'); await f.grade(client); await f.cleanup(client, 'reviewer');
  assert.equal(lease.snapshot().knownTokens, 49); assert.equal(lease.snapshot().usageComplete, true);
  assert.equal(lease.snapshot().cleanup, 'complete');
  await assert.rejects(f.grade(client)); assert.equal(f.calls.filter(name => name === 'judge').length, 1);
  await lease.seal(); await lease.seal(); await lease.drain();
  await assert.rejects(supervisor.open(f.input), /already owns/u);
  await assert.rejects(createCatlasEffectSupervisor(f.options).open(f.input), { code: 'EEXIST' });
});

test('parent rejects changed target or write grant before Runtime invocation', async t => {
  const f = await setup(t), { client } = await f.open();
  for (const change of [{ model: 'foreign' }, { workspaceAccess: 'read_write' }, { cwd: f.root },
    { allowedTools: ['write_file'] }, { skills: { requestedSkills: ['foreign'], strict: true } },
    { modelSelection: { strategy: 'alternate' } }, { context: { ...f.create.context, workspace: { cwd: f.root } } }]) {
    await assert.rejects(client.runtimeClient.createSession({ ...f.create, ...change }));
  }
  assert.deepEqual(f.calls, []);
});

test('message capability excludes extra files, skills, strategies and changed instructions', async t => {
  const f = await setup(t), { client } = await f.open();
  await client.runtimeClient.createSession(f.create);
  const content = JSON.stringify({ ...f.input.fixture, knowledge: [] });
  for (const extra of [{ outputDir: f.root }, { skills: { requestedSkills: ['extra'] } },
    { requestedStrategy: 'extra' }, { instructions: 'Changed instructions' },
    { context: { workspace: { cwd: f.root } } }, { correlation: { taskId: 'foreign' } }]) {
    await assert.rejects(client.runtimeClient.sendMessage(f.session.id, content, extra));
  }
  assert.equal(f.calls.includes('send'), false);
  await f.send(client); assert.equal(f.calls.filter(value => value === 'send').length, 1);
});

for (const usage of [0, undefined]) test(`missing advice usage cannot become a complete zero charge (${usage})`, async t => {
  const f = await setup(t); f.options.runtimeClient.sendMessage = async () => usage === undefined
    ? { segments: [] } : { tokensUsed: usage, segments: [] };
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await f.send(client);
  assert.equal(lease.snapshot().knownTokens, 0); assert.equal(lease.snapshot().usageComplete, false);
  await f.cleanup(client, 'catlas'); await assert.rejects(f.grade(client));
});

test('intent persistence failure blocks dispatch and remains non-durable', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await writeNew(join(f.input.fixtureRoot, 'effects/effect-0001-intent.json'), { occupied: true });
  await assert.rejects(client.runtimeClient.createSession(f.create));
  assert.deepEqual(f.calls, []); assert.equal(lease.snapshot().durable, false);
});

test('the real Runtime SDK can transfer a session with omitted optional skills', async t => {
  const f = await setup(t);
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url, 'http://runtime-fixture.invalid/sessions');
    assert.equal(request.method, 'POST');
    const body = JSON.parse(request.body);
    assert.equal(body.workspaceAccess, 'read_only');
    assert.deepEqual(body.skills, { requestedSkills: [], strict: true });
    return new Response(JSON.stringify({ id: f.session.id, provider: target.provider, model: target.model }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  f.options.runtimeClient = new CatsRuntimeClient('http://runtime-fixture.invalid');
  const { client, lease } = await f.open();
  const session = await client.runtimeClient.createSession(f.create);
  assert.equal(session.id, f.session.id); assert.equal(Object.hasOwn(session, 'skills'), false);
  assert.equal(lease.snapshot().sessionId, f.session.id); assert.equal(lease.snapshot().durable, true);
});

test('invalid response data cannot hide measured usage or become valid JSON', async t => {
  const f = await setup(t);
  f.options.runtimeClient.sendMessage = async () => ({ tokensUsed: 42, segments: [undefined] });
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await assert.rejects(f.send(client));
  assert.equal(lease.snapshot().knownTokens, 42); assert.equal(lease.snapshot().usageComplete, true);
  const receipt = await readJson(join(f.input.fixtureRoot, 'effects/effect-0002-failure.json'));
  assert.equal(receipt.usageTokens, 42); assert.equal(receipt.outcome, 'failed');
});

test('result persistence failure retains measured usage but never certifies durable cleanup', async t => {
  const f = await setup(t), { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create);
  await writeNew(join(f.input.fixtureRoot, 'effects/effect-0002-result.json'), { occupied: true });
  await assert.rejects(f.send(client)); await lease.seal();
  const result = await lease.drain(2000);
  assert.equal(result.knownTokens, 42); assert.equal(result.usageComplete, true);
  assert.equal(result.durable, false); assert.equal(result.cleanup, 'incomplete');
  assert.equal((await readJson(join(f.input.fixtureRoot, 'effects/effect-0002-failure.json'))).usageTokens, 42);
});

test('a failed cleanup observer stays incomplete after all effects settle', async t => {
  const f = await setup(t); f.options.reconcile = async () => { throw new Error('Observer unavailable'); };
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await lease.seal();
  const result = await lease.drain(2000);
  assert.equal(result.pending, 0); assert.equal(result.cleanup, 'incomplete');
  const receipt = await readJson(join(f.input.fixtureRoot, 'effects/reconcile-0001.json'));
  assert.deepEqual(receipt.observed, { status: 'incomplete', evidenceRefs: ['cleanup:observer-failed'] });
});

test('known Catlas spend remains visible when grader spend is unknown and blocks another inference', async t => {
  const f = await setup(t); f.options.judge = async () => ({ usageTokens: null });
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await f.send(client); await f.cleanup(client, 'catlas');
  await f.grade(client); await f.cleanup(client, 'reviewer');
  assert.equal(lease.snapshot().knownTokens, 42); assert.equal(lease.snapshot().usageComplete, false);
  await assert.rejects(f.grade(client));
});

test('measured advice that exhausts the continuation threshold cannot dispatch a judge', async t => {
  const f = await setup(t); f.input.remainingTokens = 42;
  const { client, lease } = await f.open();
  await client.runtimeClient.createSession(f.create); await f.send(client); await f.cleanup(client, 'catlas');
  await assert.rejects(f.grade(client)); assert.equal(f.calls.includes('judge'), false);
  assert.equal(lease.snapshot().knownTokens, 42);
});

for (const stage of ['create', 'send', 'judge']) test(`parent retains late ${stage} effects after the actual worker is terminated`, { timeout: 15_000 }, async t => {
  const f = await setup(t), started = deferred(), late = deferred();
  const method = { create: 'createSession', send: 'sendMessage', judge: 'judge' }[stage];
  if (stage === 'judge') f.options.judge = async () => { started.resolve(); return late.promise; };
  else f.options.runtimeClient[method] = async () => { started.resolve(); return late.promise; };
  const supervisor = createCatlasEffectSupervisor(f.options), lease = await supervisor.open(f.input); f.leases.push(lease);
  const workerFile = join(f.root, 'worker.mjs');
  await writeFile(workerFile, `import { workerData } from 'node:worker_threads';
    import { createCatlasEffectClient } from ${importPath('tools/knowledge-practice/catlasEffectClient.mjs')};
    const client = createCatlasEffectClient({ port: workerData.effectPort, resetId: workerData.input.resetId });
    await client.runtimeClient.createSession(workerData.create);
    await client.runtimeClient.sendMessage('public-session', JSON.stringify({ question: workerData.input.fixture.question,
      observation: workerData.input.fixture.observation, knowledge: [] }), {});
    await client.confirmCleanup({ resetId: workerData.input.resetId, stage: 'catlas', sessionId: 'public-session' });
    const response = { resetId: workerData.input.resetId, advice: 'Public fixture.' };
    await client.judge({ response, responseDigest: workerData.responseDigest, criteria: [] });`);
  const worker = new Worker(pathToFileURL(workerFile), { workerData: { effectPort: lease.port, create: f.create, input: f.input,
    responseDigest: digest({ resetId: f.input.resetId, advice: 'Public fixture.' }) }, transferList: [lease.port] });
  f.workers.push(worker); worker.on('error', error => assert.fail(error));
  await started.promise; await worker.terminate(); await until(() => lease.snapshot().sealed);
  assert.equal(lease.snapshot().cleanup, 'incomplete'); assert.equal(lease.snapshot().pending, 1);
  assert.equal(lease.snapshot().knownTokens, stage === 'judge' ? 42 : 0);
  assert.equal((await lease.drain(10)).pending, 1, 'A bounded drain must retain the late promise.');
  late.resolve(stage === 'create' ? f.session : stage === 'send' ? { tokensUsed: 63, segments: [] } : { usageTokens: 7 });
  const finished = await lease.drain(2000);
  assert.equal(finished.pending, 0); assert.equal(finished.cleanup, 'complete');
  assert.equal(finished.knownTokens, stage === 'create' ? 0 : stage === 'send' ? 63 : 49);
  assert.equal(finished.usageComplete, true); assert.ok(f.reconciled.at(-1).sessionId);
  if (stage === 'create') assert.equal(f.calls.includes('send'), false, 'Late creation must never dispatch advice.');
  const effect = finished.effects.find(row => row.method === method);
  const receipt = await readJson(join(f.input.fixtureRoot, `effects/effect-${String(effect.id).padStart(4, '0')}-result.json`));
  assert.equal(receipt.settled, true); assert.equal(receipt.usageTokens, effect.usageTokens);
});

test('a rejected create stays unresolved even when a cleanup observer reports absence', async t => {
  const f = await setup(t); f.options.runtimeClient.createSession = async () => { throw new Error('Transport interrupted'); };
  const { client, lease } = await f.open();
  await assert.rejects(client.runtimeClient.createSession(f.create)); await lease.seal();
  const result = await lease.drain();
  assert.equal(result.cleanup, 'incomplete'); assert.equal(result.sessionId, null);
  assert.equal(result.effects[0].requestId, f.create.context.metadata.requestId);
  assert.equal(result.effects[0].invoked, true);
});

test('an earlier cleanup observation cannot certify a session that arrives during reconciliation', async t => {
  const f = await setup(t), creating = deferred(), started = deferred(), observing = deferred(), firstObservation = deferred();
  f.options.runtimeClient.createSession = async () => { started.resolve(); return creating.promise; };
  const seen = [];
  f.options.reconcile = async value => {
    seen.push(value.sessionId);
    if (seen.length === 1) { observing.resolve(); await firstObservation.promise; }
    return { status: 'complete', evidenceRefs: ['fixture:owned-process-observation'] };
  };
  const { client, lease } = await f.open();
  const pending = client.runtimeClient.createSession(f.create); pending.catch(() => {});
  await started.promise; await lease.seal(); await observing.promise;
  creating.resolve(f.session); await until(() => lease.snapshot().pending === 0);
  assert.equal(lease.snapshot().cleanup, 'incomplete');
  firstObservation.resolve(); const result = await lease.drain(2000);
  assert.deepEqual(seen, [null, f.session.id]); assert.equal(result.cleanup, 'complete');
});

for (const mode of ['complete', 'unknown-judge', 'pending-success', 'settle-on-seal', 'abort-create']) test(`practice parent boundary: ${mode}`, { timeout: 20_000 }, async t => {
  const unknownJudge = mode === 'unknown-judge';
  const f = await setup(t), paths = await createPreservationFixture(join(f.root, 'practice'));
  const exercise = await readJson(paths.exerciseFile);
  const observation = { surface: 'code:new', observedAt: '2026-09-26T00:00:00Z', runtimeReachable: true,
    draftTarget: null, targetAvailability: 'unselected', effectiveSessionAccess: 'not_started',
    workspace: { selection: 'unselected', inspectionHost: 'platform', gitStatus: 'unknown' },
    requestedPolicy: { workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default' } };
  for (const scenario of exercise.scenarios) {
    scenario.fixture = { question: 'How do I begin?', observation, rubricId: 'public' };
    scenario.context.goal = scenario.fixture.question; scenario.context.scope = observation;
    scenario.context.topics = ['execution', 'workspace', 'permissions', 'recovery'];
    scenario.checks = [{ id: 'valid', kind: 'correctness', critical: true, path: '/responseValid', equals: true }];
  }
  exercise.budget.maxAttempts = 1; await writeFile(paths.exerciseFile, canonical(exercise));
  const runtimeRoot = join(f.root, 'runtime'); await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture"});');
  await writeFile(paths.evaluatorFile, `import { dirname, join } from 'node:path';
    import { createCatlasEvaluator } from ${importPath('tools/knowledge-practice/catlasEvaluator.mjs')};
    import { createCatlasEffectClient } from ${importPath('tools/knowledge-practice/catlasEffectClient.mjs')};
    import { loadCatlasKnowledge } from ${importPath('build/server/platform/catlas/knowledge.js')};
    export async function attempt(args) {
      const effects = createCatlasEffectClient({ port: args.effectPort, resetId: args.resetId });
      const root = dirname(dirname(args.fixtureRoot));
      const result = await createCatlasEvaluator({ evaluationRoot: root, ...effects, authorId: 'public-author',
        reviewerId: 'public-reviewer', guideCat: { id: 'guide-cat-primary', modelSelection: null, executionTarget: ${JSON.stringify(target)} },
        loadKnowledge: async (_, locale) => loadCatlasKnowledge({ filePath: join(root, 'baseline.json'), locale }),
        resolveRubric: async () => [{ id: 'useful', criterion: 'Public plumbing fixture.' }] })(args);
      return { ...result, usageTokens: ${unknownJudge ? 'result.usageTokens' : '999'}, knownTokens: ${unknownJudge ? 'result.knownTokens' : '999'} };
    }`);
  const started = deferred(), late = deferred();
  if (['pending-success', 'settle-on-seal', 'abort-create'].includes(mode)) {
    await writeFile(paths.evaluatorFile, `import { randomUUID, createHash } from 'node:crypto';
      import { createCatlasEffectClient } from ${importPath('tools/knowledge-practice/catlasEffectClient.mjs')};
      export async function attempt(args) {
        const effects = createCatlasEffectClient({ port: args.effectPort, resetId: args.resetId });
        const session = await effects.runtimeClient.createSession({ ...${JSON.stringify(target)},
          workspaceKind: 'sandbox', workspaceAccess: 'read_only', permissionMode: 'default', sharingMode: 'isolated',
          skills: { requestedSkills: [], strict: true }, context: { metadata: { requestId: randomUUID(),
            knowledgeDigest: args.context.bundle.digest,
            observationDigest: createHash('sha256').update(JSON.stringify(args.fixture.observation)).digest('hex') } } });
        const pending = effects.runtimeClient.sendMessage(session.id, JSON.stringify({ question: args.fixture.question,
          observation: args.fixture.observation, knowledge: [] }), {}); pending.catch(() => {});
        await effects.runtimeClient.observeSession(session.id);
        return { complete: true, observed: { responseValid: true }, usageTokens: 999, knownTokens: 999,
          cleanup: 'complete', interventions: 0, evidenceRefs: ['fixture:premature-success'] };
      }`);
    if (mode === 'abort-create') f.options.runtimeClient.createSession = async () => { started.resolve(); return late.promise; };
    else {
      f.options.runtimeClient.sendMessage = async () => { started.resolve(); return late.promise; };
      f.options.runtimeClient.observeSession = async () => { await started.promise; return { session: f.session }; };
    }
  }
  await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  await admitPractice({ ...paths, runtimeRoot });
  if (unknownJudge) f.options.judge = async () => ({ usageTokens: null });
  const supervisor = createCatlasEffectSupervisor({ ...f.options, evaluationRoot: paths.runRoot });
  const effectSupervisor = mode === 'settle-on-seal' ? { async open(input) {
    const lease = await supervisor.open(input);
    return { ...lease, async seal(reason) {
      const sealed = lease.seal(reason);
      late.resolve({ tokensUsed: 63, segments: [] });
      await sealed; await lease.drain(2000);
    } };
  } } : supervisor;
  const controller = new AbortController();
  const evaluating = evaluatePractice({ runRoot: paths.runRoot, candidateFile: paths.candidateFile,
    effectSupervisor, signal: controller.signal });
  if (mode === 'abort-create') { await started.promise; controller.abort(); }
  const feedback = await evaluating;
  assert.equal(feedback.completedAttempts, 1); assert.equal(feedback.gatesPassed, false);
  const result = await verifyEvaluation(paths.runRoot);
  const measuredTokens = mode === 'complete' ? 49 : unknownJudge ? 42 : mode === 'settle-on-seal' ? 63 : 0;
  const tokensComplete = ['complete', 'abort-create', 'settle-on-seal'].includes(mode);
  assert.deepEqual(result.evaluation.usage, { measuredTokens, tokensComplete });
  const row = await readRecord(paths.runRoot, 'attempt-0001.json');
  assert.equal(row.knownTokens, measuredTokens); assert.equal(row.tokens, tokensComplete ? measuredTokens : null);
  assert.equal(row.parentEffects.knownTokens, row.knownTokens);
  if (mode === 'settle-on-seal') {
    assert.equal(row.checks, null); assert.equal(row.parentEffects.pending, 0);
    assert.equal(row.parentEffects.cleanup, 'complete'); assert.equal(row.failureClass, 'unresolved_effects');
  }
  if (mode === 'pending-success' || mode === 'abort-create') {
    assert.equal(supervisor.inspect(row.resetId).sealed, true);
    assert.equal(row.checks, null); assert.equal(row.parentEffects.pending, 1);
    late.resolve(mode === 'abort-create' ? f.session : { tokensUsed: 63, segments: [] });
    await supervisor.drain(2000);
    assert.equal(supervisor.inspect(row.resetId).knownTokens, mode === 'abort-create' ? 0 : 63);
    assert.equal(f.calls.includes('send'), false);
    assert.deepEqual((await readRecord(paths.runRoot, 'evaluation.json')).usage, result.evaluation.usage,
      'Late evidence must not rewrite an incomplete evaluation.');
  } else await supervisor.drain(2000);
});
