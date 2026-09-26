import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCandidate } from '../tools/knowledge-practice/candidate.mjs';
import { admitPractice, evaluatePractice, inspectPractice } from '../tools/knowledge-practice/practice.mjs';
import { verifyEvaluation, reviewCandidate } from '../tools/knowledge-practice/promotion.mjs';
import { preservationCheck, PRESERVATION_CHECK } from '../tools/knowledge-practice/changes.mjs';
import { assembleProductKnowledgeContext, selectProductKnowledge } from '../build/server/platform/knowledge/productKnowledge.js';
import { createPreservationFixture, FIXTURE_LESSON } from '../tools/knowledge-practice/preservationFixture.mjs';
import { digest, readJson, readRecord, writeNew, writeRecord } from '../tools/knowledge-practice/artifacts.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';

async function fixture(t, change = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-preservation-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const paths = await createPreservationFixture(root);
  const runtimeRoot = join(root, 'runtime');
  await writeNew(join(runtimeRoot, 'package.json'), { name: '@cats-inc/cats-runtime', type: 'module' });
  await writeNew(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture-policy"});');
  const exercise = await readJson(paths.exerciseFile), draft = await readJson(paths.draftFile);
  await change({ paths, exercise, draft });
  await writeFile(paths.exerciseFile, JSON.stringify(exercise));
  await writeFile(paths.draftFile, JSON.stringify(draft));
  await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  return { root, paths, exercise, runtimeRoot,
    admit: () => admitPractice({ ...paths, runtimeRoot }),
    evaluate: () => evaluatePractice({ runRoot: paths.runRoot, candidateFile: paths.candidateFile }) };
}

test('direct Catlas selection loss cannot be hidden by equal assembled contexts', () => {
  for (const locale of ['en', 'zh-TW']) {
    const entry = (id, content, topics) => ({ id, revision: 1, digest: 'd'.repeat(64), topics,
      verifiedAt: '2026-09-26', sources: ['fixture:source'], content, roles: ['catlas'], kind: 'concept',
      surfaces: ['code-help'], requiredOperations: [] });
    const baseline = { status: 'ready', bundle: { revision: 'v1', digest: 'a'.repeat(64), locale,
      entries: [entry('a', 'a'.repeat(2_700), ['always']), entry('b', '"'.repeat(2_250), ['b']),
        entry('c', '"'.repeat(3_550), ['c'])] } };
    const proposed = structuredClone(baseline); proposed.bundle.revision = 'v2';
    proposed.bundle.entries[0].content += 'b'.repeat(900); proposed.bundle.entries[0].revision++;
    const context = { role: 'catlas', surface: 'code-help', locale, goal: 'Goal',
      scope: { padding: 'p'.repeat(5_800) }, topics: ['b', 'c'], operations: [] };
    assert.deepEqual(selectProductKnowledge(baseline.bundle, context).map(item => item.id), ['a', 'b', 'c']);
    assert.deepEqual(selectProductKnowledge(proposed.bundle, context).map(item => item.id), ['a', 'b']);
    assert.deepEqual(assembleProductKnowledgeContext(baseline, context).entries.map(item => item.id), ['a', 'b']);
    assert.deepEqual(assembleProductKnowledgeContext(proposed, context).entries.map(item => item.id), ['a', 'b']);
    assert.equal(preservationCheck(baseline, proposed, context,
      [{ entryId: 'a', evidenceRefs: ['fixture:scope'] }]).passed, false);
  }
});

test('bilingual topic-preservation fixture completes 60 resets with independent critical checks', async t => {
  const f = await fixture(t);
  const result = await main(['fixture-demo', '--suite', 'preservation', '--runtime-root', f.runtimeRoot,
    '--out', join(f.root, 'demo'), '--consumer', 'catlas']);
  assert.equal(result.providerCalls, 0); assert.equal(result.evidenceMode, 'fixture');
  assert.equal(result.feedback.completedAttempts, 60); assert.equal(result.feedback.gatesPassed, true);
  assert.equal(result.feedback.productionEligible, false);
  const verified = await verifyEvaluation(result.runRoot);
  assert.equal(verified.evaluation.usage.measuredTokens, 0);
  assert.equal(verified.comparison.improvement, 6);
  const rows = await Promise.all(verified.evaluation.attempts.map(ref => readRecord(result.runRoot, `attempt-${ref.attemptId}.json`)));
  assert.equal(new Set(rows.map(row => row.resetId)).size, 60);
  assert.ok(rows.every(row => row.checks.some(check => check.id === PRESERVATION_CHECK && check.critical && check.passed)));
  assert.ok(!JSON.stringify(result.feedback).includes('execution-en'));
  await assert.rejects(main(['fixture-demo', '--suite', 'preservation', '--runtime-root', f.runtimeRoot,
    '--out', join(f.root, 'wrong-consumer'), '--consumer', 'orchestrator']), /Catlas only/u);
});

test('historical all-topic overwrite is rejected before evaluator dispatch and cannot be replayed', async t => {
  const f = await fixture(t, ({ draft }) => {
    for (const entry of draft.knowledge.entries) {
      entry.revision++; entry.content = { ...FIXTURE_LESSON };
    }
  });
  await f.admit();
  await assert.rejects(f.evaluate(), /Unrelated knowledge changed/u);
  assert.equal((await readdir(f.paths.runRoot)).some(name => name.startsWith('intent-')), false);
  assert.equal((await inspectPractice(f.paths.runRoot)).status, 'incomplete-no-replay');
  await assert.rejects(f.evaluate(), /already started/u);
});

test('a permitted recovery rewrite still fails independent retained-guidance checks', async t => {
  const f = await fixture(t, ({ draft }) => {
    draft.knowledge.entries.find(entry => entry.id === 'code.recovery').content = { ...FIXTURE_LESSON };
  });
  await f.admit();
  const feedback = await f.evaluate();
  assert.equal(feedback.completedAttempts, 60); assert.equal(feedback.gatesPassed, false);
  const { comparison, evaluation } = await verifyEvaluation(f.paths.runRoot);
  assert.equal(comparison.criticalPassed, false); assert.equal(comparison.noRegression, false);
  const failed = await readRecord(f.paths.runRoot, `attempt-${evaluation.attempts[25].attemptId}.json`);
  assert.ok(failed.checks.some(check => check.id === 'retained-guidance' && !check.passed));
  assert.ok(failed.checks.some(check => check.id === PRESERVATION_CHECK && check.passed));
});

test('long scoped guidance cannot crowd out baseline delivery or forge preservation success', async t => {
  const f = await fixture(t, ({ exercise, draft }) => {
    exercise.changeScope.push({ entryId: 'code.entry', evidenceRefs: draft.evidenceRefs });
    const entry = draft.knowledge.entries[0]; entry.revision++;
    entry.content = { en: '"'.repeat(3_000), 'zh-TW': '"'.repeat(3_000) };
    for (const scenario of exercise.scenarios) {
      scenario.context.topics = ['execution', 'workspace', 'permissions', 'recovery'];
      scenario.context.goal = 'g'.repeat(3_500); scenario.context.scope = { padding: 'p'.repeat(5_500) };
    }
  });
  // Other short scenarios keep the independent admission's bilingual coverage complete.
  const exercise = await readJson(f.paths.exerciseFile);
  for (const scenario of exercise.scenarios.slice(2)) {
    scenario.context.goal = 'Explain current Code state.'; scenario.context.scope = {};
  }
  await writeFile(f.paths.exerciseFile, JSON.stringify(exercise));
  await f.admit();
  assert.equal((await f.evaluate()).gatesPassed, false);
  const { comparison, evaluation } = await verifyEvaluation(f.paths.runRoot);
  assert.equal(comparison.criticalPassed, false);
  const reference = evaluation.attempts[1];
  const file = `attempt-${reference.attemptId}.json`;
  const row = await readRecord(f.paths.runRoot, file);
  const check = row.checks.find(item => item.id === PRESERVATION_CHECK);
  assert.equal(check.passed, false);
  check.passed = true;
  // Even an authenticated replacement must reproduce the engine-owned check.
  await rm(join(f.paths.runRoot, file)); await writeRecord(f.paths.runRoot, file, row);
  reference.digest = digest(row);
  await rm(join(f.paths.runRoot, 'evaluation.json')); await writeRecord(f.paths.runRoot, 'evaluation.json', evaluation);
  await assert.rejects(verifyEvaluation(f.paths.runRoot), /Preservation check changed/u);
});

test('scope and bilingual coverage are independently frozen at admission', async t => {
  for (const change of [
    ({ exercise }) => { exercise.evidenceMode = 'product'; delete exercise.changeScope; },
    ({ exercise }) => { exercise.changeScope[0].entryId = 'invented.entry'; },
    ({ exercise }) => { exercise.scenarios.forEach(scenario => { scenario.context.locale = 'en'; }); },
    ({ exercise }) => { exercise.scenarios.forEach(scenario => { scenario.context.topics = ['workspace']; }); },
    ({ exercise }) => { exercise.scenarios[0].checks[0].id = PRESERVATION_CHECK; },
  ]) {
    const f = await fixture(t, change); await assert.rejects(f.admit());
    await assert.rejects(readFile(join(f.paths.runRoot, 'admission.json')), { code: 'ENOENT' });
  }
  const f = await fixture(t); await f.admit();
  const exercise = await readJson(join(f.paths.runRoot, 'exercise.json')); exercise.changeScope = [];
  await writeFile(join(f.paths.runRoot, 'exercise.json'), JSON.stringify(exercise));
  await assert.rejects(f.evaluate(), /Exercise changed/u);
});

test('independent scope rejects unbound evidence and remains a promotion gate', async t => {
  const f = await fixture(t, ({ exercise }) => { exercise.changeScope[0].evidenceRefs = ['fixture:not-admitted']; });
  await f.admit(); await assert.rejects(f.evaluate(), /evidence was not admitted/u);
  const good = await fixture(t); await good.admit(); await good.evaluate();
  const attestations = { checks: { evidence: true, privacy: true, applicability: true, independence: true, heldOutIsolation: true },
    notes: 'Public fixture only.', evidenceRefs: ['fixture:review'] };
  await assert.rejects(reviewCandidate({ runRoot: good.paths.runRoot, candidateFile: good.paths.candidateFile,
    reviewerId: 'fixture-reviewer', decision: 'accept', attestations }), /Fixture evidence/u);
});
