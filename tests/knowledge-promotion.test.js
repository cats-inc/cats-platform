import assert from 'node:assert/strict';
import fs, { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFixtureInputs } from '../tools/knowledge-practice/example.mjs';
import { candidateBundle, createCandidate, validateBundle } from '../tools/knowledge-practice/candidate.mjs';
import { admitPractice, evaluatePractice, inspectPractice } from '../tools/knowledge-practice/practice.mjs';
import { assertBaselinePreserved, assertPromotionSelection, exportKnowledge, ReviewedKnowledgeStore,
  reviewCandidate, revokeKnowledge, verifyEvaluation } from '../tools/knowledge-practice/promotion.mjs';
import { canonical, digest, readJson, readRecord, writeRecord } from '../tools/knowledge-practice/artifacts.mjs';
import { main } from '../tools/knowledge-practice/cli.mjs';
import { assembleProductKnowledgeContext, productKnowledgeInstructions } from '../build/server/platform/knowledge/productKnowledge.js';
import { loadCatlasKnowledge, selectCatlasKnowledge } from '../build/server/platform/catlas/knowledge.js';
import { inferCatlasAdvice } from '../build/server/platform/catlas/inference.js';
import { loadOrchestratorKnowledge } from '../build/server/products/chat/state/orchestratorKnowledge.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createChannel, buildChannelView } from '../build/server/products/chat/state/model/index.js';

const attestations = { checks: { evidence: true, privacy: true, applicability: true,
  independence: true, heldOutIsolation: true },
notes: 'Synthetic review fixture only; public cases do not establish production holdout independence.',
evidenceRefs: ['fixture:independent-review'] };

async function fixture(t, consumer = 'catlas') {
  const root = await mkdtemp(join(tmpdir(), 'cats-promotion-test-'));
  t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'cats-promotion-test-')));
    return rm(root, { recursive: true, force: true }); });
  const paths = await createFixtureInputs(root, { consumer });
  const runtimeRoot = join(root, 'runtime');
  await mkdir(join(runtimeRoot, 'build/runtime/core/skills'), { recursive: true });
  await writeFile(join(runtimeRoot, 'package.json'), '{"name":"@cats-inc/cats-runtime","type":"module"}');
  await writeFile(join(runtimeRoot, 'build/runtime/core/skills/contentPolicy.js'),
    'export const getRuntimeSkillContentPolicy = () => ({profile:"preview",fingerprint:"fixture-policy"});');
  const candidate = await createCandidate({ draftFile: paths.draftFile, outputFile: paths.candidateFile });
  return { root, paths, runtimeRoot, candidate, consumer,
    review: (extra = {}) => reviewCandidate({ runRoot: paths.runRoot, candidateFile: paths.candidateFile,
      reviewerId: 'fixture-reviewer', decision: 'accept', attestations, audience: 'fixture', ...extra }),
    export: (out, extra = {}) => exportKnowledge({ runRoot: paths.runRoot, outputRoot: join(root, out),
      consumer, audience: 'fixture', ...extra }),
  };
}

async function evaluated(t, consumer) {
  const f = await fixture(t, consumer);
  await admitPractice({ ...f.paths, runtimeRoot: f.runtimeRoot });
  const feedback = await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
  assert.equal(feedback.completedAttempts, 60); assert.equal(feedback.gatesPassed, true);
  assert.equal(feedback.productionEligible, false);
  return f;
}

test('Catlas fixture review binds exact evidence, exports only knowledge, and works without author sources', async (t) => {
  const f = await evaluated(t, 'catlas');
  await assert.rejects(f.export('unreviewed'), /ENOENT/u);
  await assert.rejects(f.review({ reviewerId: 'fixture-author' }), /own candidate/u);
  await assert.rejects(f.review({ audience: 'product' }), /Fixture evidence/u);
  await assert.rejects(f.review({ attestations: { ...attestations, checks: { ...attestations.checks, privacy: false } } }), /incomplete/u);
  const changed = structuredClone(f.candidate.draft); changed.knowledge.revision = 'changed';
  const changedDraft = join(f.root, 'changed-draft.json'), changedCandidate = join(f.root, 'changed-candidate.json');
  await writeFile(changedDraft, JSON.stringify(changed));
  await createCandidate({ draftFile: changedDraft, outputFile: changedCandidate });
  await assert.rejects(f.review({ candidateFile: changedCandidate }), /changed after evaluation/u);
  const attestationFile = join(f.root, 'attestations.json');
  await writeFile(attestationFile, JSON.stringify(attestations));
  const review = await main(['review', '--run', f.paths.runRoot, '--candidate', f.paths.candidateFile,
    '--reviewer', 'fixture-reviewer', '--decision', 'accept', '--attestations', attestationFile, '--audience', 'fixture']);
  assert.equal(review.candidateDigest, f.candidate.digest);
  await assert.rejects(f.review(), /EEXIST/u);
  await assert.rejects(f.export('product', { audience: 'product' }), /audience/u);
  await assert.rejects(f.export('wrong-version', { platformVersion: '99.0.0' }), /incompatible/u);
  await assert.rejects(f.export('wrong-consumer', { consumer: 'orchestrator' }), /consumer/u);
  const outputRoot = join(f.root, 'export');
  const receipt = await main(['export', '--run', f.paths.runRoot, '--out', outputRoot, '--consumer', 'catlas', '--audience', 'fixture']);
  assert.equal(receipt.publicationEligible, false);
  assert.deepEqual((await readdir(outputRoot)).sort(), ['export-receipt.json', 'knowledge.json']);
  const filePath = join(outputRoot, 'knowledge.json');
  assert.equal(receipt.bundleDigest, digest(await readFile(filePath)));
  assert.ok(!canonical(await readJson(filePath)).includes(f.root));
  await assert.rejects(f.export('export'), /EEXIST/u);

  const store = new ReviewedKnowledgeStore(f.paths.runRoot, { consumer: 'catlas', audience: 'fixture' });
  assert.equal((await store.read()).status, 'ready');
  assert.equal((await inspectPractice(f.paths.runRoot)).review.decision, 'accept');
  const revoked = await main(['revoke', '--run', f.paths.runRoot, '--actor', 'fixture-owner', '--reason', 'Fixture retired.']);
  assert.deepEqual(await store.read(), { status: 'missing', reason: 'revoked' });
  assert.deepEqual(await revokeKnowledge({ runRoot: f.paths.runRoot, actorId: 'fixture-owner', reason: 'Duplicate.' }), revoked);
  await assert.rejects(f.export('after-revoke'), /revoked/u);
  assert.equal((await inspectPractice(f.paths.runRoot)).revoked, true);
  // A released snapshot has no runtime dependency on developer/evaluator state.
  for (const directory of [f.paths.authorRoots[0], join(f.root, 'evaluator-inputs'), f.paths.runRoot]) {
    assert.ok(directory.startsWith(f.root)); await rm(directory, { recursive: true, force: true });
  }
  const loaded = await loadCatlasKnowledge({ filePath, locale: 'en' });
  assert.equal(loaded.status, 'ready');
  const entries = selectCatlasKnowledge(loaded.bundle, ['code', 'collaboration']);
  assert.equal(entries.length, 2);
  const calls = [];
  const runtimeClient = {
    createSession: async (input) => { calls.push({ create: input }); return { id: 'fixture-help', provider: input.provider, model: input.model }; },
    sendMessage: async (id, content) => { calls.push({ prompt: JSON.parse(content) }); return { segments: [{ kind: 'text',
      text: JSON.stringify({ advice: 'Clarify the current workspace.', knowledgeIds: ['practice.guide'] }) }] }; },
    closeSession: async (id) => { calls.push({ close: id }); }, cancelSession: async () => {},
  };
  const result = await inferCatlasAdvice({ runtimeClient, guideCat: { id: 'fixture-catlas', modelSelection: null,
    executionTarget: { provider: 'claude', instance: 'fixture', model: 'fixture' } },
  locale: 'en', question: 'Help me start.', surface: 'code:new', observation: { workspace: 'unknown' },
  bundle: loaded.bundle, entries, signal: new AbortController().signal });
  assert.equal(calls[0].create.workspaceAccess, 'read_only'); assert.equal(calls[0].create.cwd, undefined);
  assert.deepEqual(calls[0].create.skills.requestedSkills, []);
  assert.equal(calls[1].prompt.knowledge[0].content, entries[0].content);
  assert.equal(result.receipt.knowledgeDigest, receipt.bundleDigest); assert.equal(result.receipt.sessionCleanup, 'closed');
});

test('Orchestrator fixture export preserves operation scopes; tampered and stale evidence fails closed', async (t) => {
  const f = await evaluated(t, 'orchestrator'); await f.review();
  for (const name of ['attempt-0001.json', 'evaluation.json', 'review.json']) {
    const file = join(f.paths.runRoot, name), original = await readFile(file);
    const value = JSON.parse(original); value.payload.forged = true;
    await writeFile(file, JSON.stringify(value));
    await assert.rejects(f.export(`tampered-${name}`), /Unauthenticated/u);
    await writeFile(file, original);
  }
  const staleRoot = join(f.root, 'stale-review'); await cp(f.paths.runRoot, staleRoot, { recursive: true });
  const stale = await readRecord(staleRoot, 'review.json'); stale.evaluationDigest = '0'.repeat(64);
  await rm(join(staleRoot, 'review.json')); await writeRecord(staleRoot, 'review.json', stale);
  await assert.rejects(exportKnowledge({ runRoot: staleRoot, outputRoot: join(f.root, 'stale-export'),
    consumer: 'orchestrator', audience: 'fixture' }), /Stale review/u);
  const engineRoot = join(f.root, 'old-engine'); await cp(f.paths.runRoot, engineRoot, { recursive: true });
  const admission = await readRecord(engineRoot, 'admission.json'); admission.engineDigest = '0'.repeat(64);
  await rm(join(engineRoot, 'admission.json')); await writeRecord(engineRoot, 'admission.json', admission);
  assert.equal((await inspectPractice(engineRoot)).engineCurrent, false);
  await assert.rejects(verifyEvaluation(engineRoot), /engine changed/u);
  await revokeKnowledge({ runRoot: engineRoot, actorId: 'fixture-owner', reason: 'Old engine evidence retired.' });

  const receipt = await f.export('export'); assert.equal(receipt.publicationEligible, false);
  const filePath = join(f.root, 'export', 'knowledge.json');
  const source = await readJson(filePath);
  for (const directory of [f.paths.authorRoots[0], join(f.root, 'evaluator-inputs'), f.paths.runRoot]) {
    assert.ok(directory.startsWith(f.root)); await rm(directory, { recursive: true, force: true });
  }
  let state = createDefaultChatState();
  state = createChannel(state, { title: 'Fixture', topic: 'Isolated fixture', originSurface: 'chat',
    roomMode: 'chat_channel', responseLanguage: 'zh-TW' }, new Date('2026-09-25T00:00:00Z'));
  const options = { channel: buildChannelView(state, state.selectedChannelId), body: 'Ask a teammate to review.',
    surface: 'chat-visible', target: { provider: 'claude', model: 'fixture' }, filePath,
    operations: [{ id: 'chat.collaboration.inspect_context', version: '1.0' }] };
  const context = await loadOrchestratorKnowledge(options);
  assert.equal(context.bundle.digest, receipt.bundleDigest);
  assert.equal(context.entries.find((entry) => entry.id === 'practice.coordination').content, source.entries[1].content['zh-TW']);
  assert.match(productKnowledgeInstructions(context), /practice.coordination/u);
  const noTool = await loadOrchestratorKnowledge({ ...options, operations: [] });
  assert.equal(noTool.entries.some((entry) => entry.id === 'practice.coordination'), false);

  // Copy of the authenticated fixture remains private and supports concurrency
  // checks with filesystem scheduling, never an injected production hook.
  const open = fs.open;
  async function exportWithRevoke(root, output, when) {
    let triggered = false;
    const hook = t.mock.method(fs, 'open', async (path, ...args) => {
      if (path === join(output, when) && !triggered) {
        triggered = true;
        await revokeKnowledge({ runRoot: root, actorId: 'fixture-owner', reason: 'Concurrent fixture revocation.' });
      }
      return open(path, ...args);
    });
    syncBuiltinESMExports();
    try { return await exportKnowledge({ runRoot: root, outputRoot: output, consumer: 'orchestrator', audience: 'fixture' }); }
    finally { hook.mock.restore(); syncBuiltinESMExports(); assert.equal(triggered, true); }
  }
  // Restore the valid evaluation/review in this owned copy (the source-free
  // product read above deliberately deleted the original private run).
  await rm(join(staleRoot, 'review.json')); await writeRecord(staleRoot, 'review.json', { ...stale, evaluationDigest: receipt.evaluationDigest });
  const duringRoot = join(f.root, 'during-receipt'); await cp(staleRoot, duringRoot, { recursive: true });
  const earlyOut = join(f.root, 'early-export');
  await assert.rejects(exportWithRevoke(staleRoot, earlyOut, 'knowledge.json'), /Revoked during export/u);
  assert.deepEqual(await readdir(earlyOut), ['knowledge.json']);
  const snapshot = await exportWithRevoke(duringRoot, join(f.root, 'concurrent-export'), 'export-receipt.json');
  assert.equal(snapshot.bundleDigest, receipt.bundleDigest);
  const revokedStore = new ReviewedKnowledgeStore(duringRoot, { consumer: 'orchestrator', audience: 'fixture' });
  assert.deepEqual(await revokedStore.read(), { status: 'missing', reason: 'revoked' });
  await assert.rejects(exportKnowledge({ runRoot: duringRoot, outputRoot: join(f.root, 'later-export'),
    consumer: 'orchestrator', audience: 'fixture' }), /revoked/u);
});

test('promotion refuses provenance growth that evicts previously evaluated content', async (t) => {
  const f = await fixture(t);
  const draft = structuredClone(f.candidate.draft), entry = draft.knowledge.entries[0];
  draft.knowledge.entries = Array.from({ length: 4 }, (_, i) => ({ ...entry, id: `boundary.entry-${i}`,
    content: { en: 'x'.repeat(3_400), 'zh-TW': 'x'.repeat(3_400) } }));
  const candidate = { ...f.candidate, draft, digest: digest(draft) };
  const before = candidateBundle(candidate, '1970-01-01');
  const after = structuredClone(before);
  for (const item of after.entries) item.sources.push(`evaluation:${'e'.repeat(64)}`, `review:${'a'.repeat(64)}`);
  const context = { role: 'catlas', surface: 'code-help', locale: 'en', goal: 'Next step', scope: {}, topics: ['code'], operations: [] };
  const { platformVersion } = await readJson(f.paths.exerciseFile);
  const beforeLoaded = (await validateBundle(before, platformVersion)).en;
  const afterLoaded = (await validateBundle(after, platformVersion)).en;
  assert.equal(assembleProductKnowledgeContext(beforeLoaded, context).entries.length, 4);
  assert.ok(assembleProductKnowledgeContext(afterLoaded, context).entries.length < 4);
  await assert.rejects(assertPromotionSelection({ candidate, exercise: { platformVersion, scenarios: [{ context }] } }, after),
    /Promotion changed/u);
});

test('a complete proposal preserves baseline entry identity and increments changed revisions', async (t) => {
  const f = await fixture(t), baseline = await readJson(f.paths.baselineFile);
  assertBaselinePreserved(baseline, f.candidate);
  const removed = structuredClone(f.candidate); removed.draft.knowledge.entries.shift();
  assert.throws(() => assertBaselinePreserved(baseline, removed), /preserve baseline/u);
  const changed = structuredClone(f.candidate); changed.draft.knowledge.entries[0].content.en += ' Changed.';
  assert.throws(() => assertBaselinePreserved(baseline, changed), /higher revision/u);
  changed.draft.knowledge.entries[0].revision++; assertBaselinePreserved(baseline, changed);
  const newer = structuredClone(baseline); newer.entries[0].revision++;
  assert.throws(() => assertBaselinePreserved(newer, f.candidate), /regressed/u);
});

test('partial evidence cannot be approved and an explicit rejection cannot export', async (t) => {
  const f = await fixture(t);
  const exercise = await readJson(f.paths.exerciseFile); exercise.budget.maxAttempts = 1;
  await writeFile(f.paths.exerciseFile, JSON.stringify(exercise));
  await admitPractice({ ...f.paths, runtimeRoot: f.runtimeRoot });
  await evaluatePractice({ runRoot: f.paths.runRoot, candidateFile: f.paths.candidateFile });
  await assert.rejects(f.review(), /gates did not pass/u);
  await f.review({ decision: 'reject' });
  await assert.rejects(f.export('rejected'), /No accepted independent review/u);
});
