import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFixtureInputs, FIXTURE_EVALUATOR } from '../tools/knowledge-practice/example.mjs';
import { createCandidate, readCandidate } from '../tools/knowledge-practice/candidate.mjs';
import { admitPractice, compareAttempts, evaluatePractice, inspectPractice } from '../tools/knowledge-practice/practice.mjs';
import { assertSeparated, canonical, readJson, readRecord, writeRecord } from '../tools/knowledge-practice/artifacts.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';

async function setup(t, change = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-practice-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = await createFixtureInputs(root);
  const runtimeRoot = join(root, 'runtime');
  await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture-policy"});');
  const exercise = await readJson(paths.exerciseFile);
  await change({ root, paths, exercise, runtimeRoot });
  await writeFile(paths.exerciseFile, JSON.stringify(exercise));
  const candidate = await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  return { root, paths, exercise, candidate, runtimeRoot,
    admit: () => admitPractice({ ...paths, runtimeRoot }) };
}

test('P3 CLI freezes a full fixture curriculum, records 60 unique resets and never grants production promotion', async (t) => {
  const f = await setup(t);
  await f.admit();
  assert.equal((await main(['inspect', '--run', f.paths.runRoot])).status, 'admitted');
  const feedback = await main(['evaluate', '--run', f.paths.runRoot, '--candidate', f.paths.candidateFile]);
  assert.equal(feedback.completedAttempts, 60); assert.equal(feedback.gatesPassed, true);
  assert.equal(feedback.productionEligible, false); assert.deepEqual(feedback.trainingFailures, []);
  assert.equal(feedback.heldOutGate, 'passed'); assert.ok(!JSON.stringify(feedback).includes('held-visible-coordination'));
  const evaluation = await readRecord(f.paths.runRoot, 'evaluation.json');
  assert.deepEqual(evaluation.usage, { measuredTokens: 0, tokensComplete: true });
  assert.ok(evaluation.comparison.improvement > 0);
  assert.equal((await readdir(join(f.paths.runRoot, 'resets'))).length, 60);
  const intent = await readRecord(f.paths.runRoot, 'intent-0001.json');
  const receipt = await readRecord(f.paths.runRoot, 'attempt-0001.json');
  assert.equal(intent.resetId, receipt.resetId); assert.equal(receipt.contextDigest.length, 64);
  assert.equal(Object.hasOwn(receipt, 'observed'), false);
  await assert.rejects(f.admit(), /EEXIST/u);
  await assert.rejects(evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile }), /already started/u);
});

test('changed evaluator and physically overlapping author scopes cannot enter evaluation', async (t) => {
  const f = await setup(t);
  const alias = join(f.root, 'alias');
  await symlink(f.paths.authorRoots[0], alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(assertSeparated([alias], [join(f.paths.authorRoots[0], 'protected.json')]), /disjoint/u);
  await f.admit();
  await writeFile(join(f.paths.runRoot, 'evaluator.mjs'), `${FIXTURE_EVALUATOR}\n// changed after admission`);
  await assert.rejects(evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile }), /Evaluator changed/u);
  assert.equal((await inspectPractice(f.paths.runRoot)).status, 'admitted');
});

test('release artifacts, malformed curriculum and self-evaluation are rejected', async (t) => {
  const release = await setup(t, async ({ runtimeRoot }) => {
    await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
      'export const getRuntimeSkillContentPolicy = () => ({profile:"release"});');
  });
  await assert.rejects(release.admit(), /preview Runtime/u);
  const short = await setup(t, ({ exercise }) => { exercise.scenarios.pop(); });
  await assert.rejects(short.admit());
  const self = await setup(t);
  self.paths.evaluatorId = 'fixture-author'; await self.admit();
  await assert.rejects(evaluatePractice({ runRoot: self.paths.runRoot, candidateFile: self.paths.candidateFile }), /own candidate/u);
});

test('started intent survives interruption and cannot be silently replayed', async (t) => {
  const f = await setup(t); const admission = await f.admit();
  await writeRecord(f.paths.runRoot, 'evaluation-started.json', { runId: admission.runId,
    candidateDigest: f.candidate.digest, startedAt: Date.now() });
  assert.equal((await inspectPractice(f.paths.runRoot)).status, 'incomplete-no-replay');
  await assert.rejects(evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile }), /already started/u);
  assert.equal((await readdir(f.paths.runRoot)).some((name) => name.startsWith('attempt-')), false);
});

test('incompatible candidate capture remains visible as incomplete, and missing scope fails admission', async (t) => {
  const f = await setup(t, async ({ paths }) => {
    const draft = await readJson(paths.draftFile);
    draft.knowledge.requiredCapabilities.push('unavailable-capability');
    await writeFile(paths.draftFile, JSON.stringify(draft));
  });
  await f.admit();
  await assert.rejects(evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile }), /incompatible/u);
  assert.equal((await inspectPractice(f.paths.runRoot)).status, 'incomplete-no-replay');
  await assert.rejects(evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile }), /already started/u);
  const missing = await setup(t, ({ exercise }) => { delete exercise.scenarios[0].context.scope; });
  await assert.rejects(missing.admit());
});

test('budget exhaustion retains consumed attempts and blocks complete evidence', async (t) => {
  const f = await setup(t, ({ exercise }) => { exercise.budget.maxAttempts = 1; });
  await f.admit();
  const feedback = await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
  assert.equal(feedback.stopReason, 'budget_exhausted'); assert.equal(feedback.completedAttempts, 1);
  assert.equal(feedback.gatesPassed, false);
});

test('semantic or cleanup failure charges measured usage; timeout keeps unknown usage explicit', async (t) => {
  for (const mode of ['bad-cleanup', 'self-reported-success', 'timeout', 'abort-with-usage']) {
    const f = await setup(t, async ({ paths, exercise }) => {
      exercise.budget.attemptTimeoutMs = mode === 'timeout' ? 80 : mode === 'abort-with-usage' ? 1_500 : 5_000;
      await writeFile(paths.evaluatorFile, mode === 'timeout'
        ? 'export async function attempt() { await new Promise(() => {}); }'
        : `export async function attempt({signal}) { ${mode === 'abort-with-usage'
          ? "await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, {once:true}));" : ''}
            return { observed: {}, usageTokens: 123, interventions: 0,
            evidenceRefs: ['fixture:attempt'], cleanup: '${mode === 'bad-cleanup' ? 'incomplete' : 'complete'}'${mode === 'self-reported-success' ? ',success:true' : ''} }; }`);
    });
    await f.admit();
    const feedback = await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
    assert.equal(feedback.gatesPassed, false); assert.equal(feedback.completedAttempts, 1);
    const result = await readRecord(f.paths.runRoot, 'evaluation.json');
    assert.deepEqual(result.usage, { measuredTokens: mode === 'timeout' ? 0 : 123, tokensComplete: mode !== 'timeout' });
    assert.equal(result.comparison.complete, false);
  }
});

test('critical failure defeats aggregate improvement and a regressed check defeats an improved total', () => {
  const exercise = { scenarios: [{}], repeats: 1, metric: { name: 'passedChecks', minimumImprovement: 1 } };
  const check = (id, passed, critical = false) => ({ id, passed, critical, kind: 'policy' });
  const baseline = { phase: 'baseline', scenarioId: 'one', repeat: 0, tokens: 0,
    checks: [check('critical', true, true), check('a', false), check('b', false)] };
  const candidate = { ...baseline, phase: 'candidate', checks: [check('critical', false, true), check('a', true), check('b', true)] };
  const result = compareAttempts(exercise, [baseline, candidate], null);
  assert.equal(result.improved, true); assert.equal(result.criticalPassed, false);
  assert.equal(result.noRegression, false); assert.equal(result.gatesPassed, false);
});

test('an incomplete baseline cannot become an artificially low score for a passing candidate', async t => {
  const f = await setup(t, async ({ paths, exercise }) => {
    const baseline = await readJson(paths.baselineFile);
    for (const scenario of exercise.scenarios) scenario.checks = [
      { id: 'quality', kind: 'correctness', critical: true, path: '/quality', equals: true },
    ];
    await writeFile(paths.evaluatorFile, `export async function attempt({context}) {
      const complete = context.bundle.revision !== ${JSON.stringify(baseline.revision)};
      return { complete, observed: { quality: complete }, usageTokens: 17, knownTokens: 17,
        interventions: 0, cleanup: 'complete', evidenceRefs: ['fixture:indeterminate-baseline'] };
    }`);
  });
  await f.admit();
  const feedback = await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
  assert.equal(feedback.completedAttempts, 1); assert.equal(feedback.gatesPassed, false);
  const result = await readRecord(f.paths.runRoot, 'evaluation.json');
  assert.equal(result.comparison.complete, false); assert.equal(result.comparison.improved, false);
  assert.deepEqual(result.usage, { measuredTokens: 17, tokensComplete: true });
  assert.equal((await readRecord(f.paths.runRoot, 'attempt-0001.json')).checks, null);
});

test('forged receipts, private text and developer instructions do not become knowledge', async (t) => {
  const f = await setup(t); await f.admit();
  const envelope = await readJson(join(f.paths.runRoot, 'admission.json'));
  envelope.payload.evaluatorId = 'forged';
  await writeFile(join(f.paths.runRoot, 'admission.json'), JSON.stringify(envelope));
  await assert.rejects(readRecord(f.paths.runRoot, 'admission.json'), /Unauthenticated/u);
  for (const content of ['C:\\Users\\private\\project', 'Apply cats-inc-development and inspect SKILL.md', 'Bearer private-key']) {
    const draft = JSON.parse(await readFile(f.paths.draftFile, 'utf8'));
    draft.knowledge.entries[0].content.en = content;
    await writeFile(f.paths.draftFile, JSON.stringify(draft));
    await assert.rejects(createCandidate({ draftFile: f.paths.draftFile, outputFile: join(f.root, 'rejected.json') }), /sanitization/u);
  }
});

test('non-JSON worker observations cannot compare as null, empty arrays or objects', async (t) => {
  for (const [value, expected] of [['NaN', null], ['[undefined]', []], ['new Date()', {}]]) {
    const f = await setup(t, async ({ paths, exercise }) => {
      exercise.scenarios[0].checks = [{ id: 'value', kind: 'correctness', critical: true, path: '/value', equals: expected }];
      await writeFile(paths.evaluatorFile, `export async function attempt() { return { observed:{value:${value}},
        usageTokens:7, interventions:0, evidenceRefs:['fixture:json'], cleanup:'complete' }; }`);
    });
    await f.admit();
    const result = await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
    assert.equal(result.gatesPassed, false); assert.equal(result.stopReason, 'invalid_or_changed_evidence');
    assert.equal((await readRecord(f.paths.runRoot, 'evaluation.json')).usage.measuredTokens, 7);
  }
  const cyclic = {}; cyclic.self = cyclic;
  const extra = []; extra.unexpected = true;
  for (const value of [cyclic, Array(2), new Map(), Infinity, extra]) assert.throws(() => canonical(value));
});

test('candidate size admission includes the full envelope', async (t) => {
  const f = await setup(t);
  const draft = await readJson(f.paths.draftFile);
  const entry = draft.knowledge.entries[0];
  draft.knowledge.entries = Array.from({ length: 15 }, (_, index) => ({ ...entry, id: `large.entry-${index}`,
    content: { en: 'x'.repeat(4_000), 'zh-TW': 'y'.repeat(4_000) } }));
  draft.counterexamples = Array(16).fill('x');
  let remaining = 128 * 1024 - 1 - Buffer.byteLength(canonical({ schemaVersion: 1, state: 'unverified', draft, digest: '0'.repeat(64) }));
  assert.ok(remaining > 0);
  for (let index = 0; index < 16 && remaining > 0; index++) {
    const extra = Math.min(999, remaining); draft.counterexamples[index] += 'x'.repeat(extra); remaining -= extra;
  }
  assert.equal(remaining, 0);
  await writeFile(f.paths.draftFile, JSON.stringify(draft));
  const boundary = join(f.root, 'boundary.json');
  const accepted = await createCandidate({ draftFile: f.paths.draftFile, outputFile: boundary });
  assert.equal((await readFile(boundary)).length, 128 * 1024);
  assert.equal((await readCandidate(boundary)).digest, accepted.digest);
  draft.counterexamples[15] += 'x';
  await writeFile(f.paths.draftFile, JSON.stringify(draft));
  await assert.rejects(createCandidate({ draftFile: f.paths.draftFile, outputFile: join(f.root, 'oversized.json') }), /envelope exceeds/u);
});
