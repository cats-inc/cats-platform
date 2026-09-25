import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLATFORM_VERSION } from '#cats-app-package';
import { CATLAS_CODE_CAPABILITIES } from '../../build/server/platform/catlas/knowledge.js';
import { ORCHESTRATOR_KNOWLEDGE_CAPABILITIES } from '../../build/server/products/chat/state/orchestratorKnowledge.js';
import { assembleProductKnowledgeContext, loadProductKnowledge, selectProductKnowledge } from '../../build/server/platform/knowledge/productKnowledge.js';
import { canonical, digest, evidenceIds, fields, hasRecord, id, integer, readJson, readRecord, safeText, writeNew, writeRecord } from './artifacts.mjs';
import { candidateBundle, readCandidate, validateBundle } from './candidate.mjs';
import { compareAttempts, frozenInputs } from './practice.mjs';

const REVIEW_CHECKS = ['evidence', 'privacy', 'applicability', 'independence', 'heldOutIsolation'];
const consumers = { catlas: CATLAS_CODE_CAPABILITIES, orchestrator: ORCHESTRATOR_KNOWLEDGE_CAPABILITIES };
function audience(value) { assert.ok(['product', 'fixture'].includes(value), 'Unknown audience.'); return value; }

export async function verifyEvaluation(runRoot) {
  const { admission, exercise, baseline } = await frozenInputs(runRoot);
  const start = await readRecord(runRoot, 'evaluation-started.json');
  const evaluation = await readRecord(runRoot, 'evaluation.json');
  const candidate = await readCandidate(join(runRoot, 'candidate.json'));
  assert.equal(start.runId, admission.runId); assert.equal(evaluation.runId, admission.runId);
  assert.equal(start.candidateDigest, candidate.digest); assert.equal(evaluation.candidateDigest, candidate.digest);
  for (const key of ['exerciseDigest', 'evaluatorDigest', 'engineDigest', 'evaluatorId', 'evidenceMode']) {
    assert.equal(evaluation[key], admission[key], 'Evaluation input binding changed.');
  }
  const projected = candidateBundle(candidate, '1970-01-01');
  assert.equal(digest(await readJson(join(runRoot, 'candidate-bundle.json'))), digest(projected));
  const bundles = { baseline: await validateBundle(baseline, exercise.platformVersion),
    candidate: await validateBundle(projected, exercise.platformVersion) };
  const planned = exercise.scenarios.flatMap((scenario) => Array.from({ length: exercise.repeats }, (_, repeat) =>
    ['baseline', 'candidate'].map((phase) => ({ scenario, repeat, phase }))).flat());
  const resets = new Set(), attempts = [];
  for (const [index, reference] of evaluation.attempts.entries()) {
    const expected = planned[index]; assert.ok(expected, 'Unexpected extra attempt.');
    assert.equal(reference.attemptId, String(index + 1).padStart(4, '0'));
    const row = await readRecord(runRoot, `attempt-${reference.attemptId}.json`);
    const intent = await readRecord(runRoot, `intent-${reference.attemptId}.json`);
    assert.equal(digest(row), reference.digest, 'Attempt digest changed.');
    for (const [key, value] of Object.entries(intent)) assert.deepEqual(row[key], value, 'Attempt intent changed.');
    assert.equal(row.runId, admission.runId); assert.equal(row.candidateDigest, candidate.digest);
    assert.equal(row.scenarioId, expected.scenario.id); assert.equal(row.repeat, expected.repeat); assert.equal(row.phase, expected.phase);
    assert.ok(typeof row.resetId === 'string' && !resets.has(row.resetId), 'Reset identity was reused.'); resets.add(row.resetId);
    integer(row.elapsedMs, 0, Number.MAX_SAFE_INTEGER);
    if (row.tokens !== null) integer(row.tokens, 0, Number.MAX_SAFE_INTEGER);
    if (row.checks) {
      assert.equal(row.checks.length, expected.scenario.checks.length);
      row.checks.forEach((check, checkIndex) => {
        const frozen = expected.scenario.checks[checkIndex];
        for (const key of ['id', 'kind', 'critical']) assert.equal(check[key], frozen[key]);
        assert.equal(typeof check.passed, 'boolean');
      });
      const context = assembleProductKnowledgeContext(bundles[row.phase][expected.scenario.context.locale], expected.scenario.context);
      assert.equal(row.contextDigest, context.contextDigest, 'Delivered knowledge binding changed.');
    }
    attempts.push(row);
  }
  const comparison = compareAttempts(exercise, attempts, evaluation.stopReason);
  assert.deepEqual(evaluation.comparison, comparison, 'Evaluation summary changed.');
  assert.deepEqual(evaluation.usage, { measuredTokens: attempts.reduce((sum, row) => sum + (row.tokens ?? 0), 0),
    tokensComplete: attempts.every((row) => row.tokens !== null) });
  assert.equal(evaluation.productionEligible, comparison.gatesPassed && admission.evidenceMode === 'product');
  if (comparison.gatesPassed) {
    assert.ok(evaluation.usage.tokensComplete && evaluation.usage.measuredTokens <= exercise.budget.maxTokens);
    assert.ok(evaluation.elapsedMs <= exercise.budget.maxElapsedMs && attempts.length <= exercise.budget.maxAttempts);
  }
  return { admission, exercise, baseline, candidate, evaluation, comparison };
}

export function assertBaselinePreserved(baseline, candidate) {
  for (const entry of baseline.entries) {
    const next = candidate.draft.knowledge.entries.find((item) => item.id === entry.id);
    assert.ok(next, 'A complete proposed bundle must preserve baseline entries.');
    assert.ok(next.revision >= entry.revision, 'Entry revision regressed.');
    const prior = { id: entry.id, revision: entry.revision, content: entry.content, topics: entry.topics,
      roles: entry.roles ?? ['catlas'], surfaces: entry.surfaces ?? ['code-help'],
      kind: entry.kind ?? 'concept', requiredOperations: entry.requiredOperations ?? [] };
    if (canonical(prior) !== canonical(next)) assert.ok(next.revision > entry.revision, 'Changed entries require a higher revision.');
  }
}

export async function reviewCandidate({ runRoot, candidateFile, reviewerId, decision, attestations,
  audience: targetAudience = 'product' }) {
  audience(targetAudience); id(reviewerId); assert.ok(['accept', 'reject'].includes(decision));
  fields(attestations, ['checks', 'notes', 'evidenceRefs']); fields(attestations.checks, REVIEW_CHECKS);
  safeText(attestations.notes, 2_000); evidenceIds(attestations.evidenceRefs);
  assert.ok(REVIEW_CHECKS.every((key) => typeof attestations.checks[key] === 'boolean'));
  const verified = await verifyEvaluation(runRoot);
  const current = await readCandidate(candidateFile);
  assert.equal(current.digest, verified.candidate.digest, 'Candidate changed after evaluation.');
  assert.notEqual(reviewerId, current.draft.authorId, 'Author cannot review their own candidate.');
  assert.ok(!await hasRecord(runRoot, 'revocation.json'), 'Candidate is revoked.');
  if (decision === 'accept') {
    assert.ok(REVIEW_CHECKS.every((key) => attestations.checks[key]), 'Independent review checks are incomplete.');
    assert.ok(verified.comparison.gatesPassed, 'Evaluation gates did not pass.');
    assert.ok(targetAudience === 'fixture' || verified.evaluation.productionEligible, 'Fixture evidence cannot promote product knowledge.');
    assertBaselinePreserved(verified.baseline, current);
  }
  const review = { schemaVersion: 1, runId: verified.admission.runId, candidateDigest: current.digest,
    evaluationDigest: digest(verified.evaluation), reviewerId, decision, audience: targetAudience,
    attestations, reviewedAt: new Date().toISOString() };
  await writeRecord(runRoot, 'review.json', review);
  return review;
}

async function reviewedBundle(runRoot, targetAudience) {
  audience(targetAudience);
  assert.ok(!await hasRecord(runRoot, 'revocation.json'), 'Candidate is revoked.');
  const verified = await verifyEvaluation(runRoot);
  const review = await readRecord(runRoot, 'review.json');
  assert.equal(review.decision, 'accept', 'No accepted independent review.');
  assert.equal(review.audience, targetAudience, 'Review audience differs from requested export.');
  assert.equal(review.runId, verified.admission.runId);
  assert.equal(review.candidateDigest, verified.candidate.digest);
  assert.equal(review.evaluationDigest, digest(verified.evaluation), 'Stale review.');
  assert.notEqual(review.reviewerId, verified.candidate.draft.authorId);
  assert.ok(REVIEW_CHECKS.every((key) => review.attestations.checks[key] === true));
  assert.ok(verified.comparison.gatesPassed);
  assert.ok(targetAudience === 'fixture' || verified.evaluation.productionEligible);
  assertBaselinePreserved(verified.baseline, verified.candidate);
  const bundle = candidateBundle(verified.candidate, review.reviewedAt.slice(0, 10));
  bundle.entries = bundle.entries.map((entry) => ({ ...entry, sources: [
    `candidate:${verified.candidate.digest}`, `evaluation:${digest(verified.evaluation)}`, `review:${digest(review)}`,
    ...verified.candidate.draft.evidenceRefs.slice(0, 5),
  ] }));
  await assertPromotionSelection(verified, bundle);
  assert.ok(!await hasRecord(runRoot, 'revocation.json'), 'Candidate was revoked during retrieval.');
  return { bundle, verified, review };
}

// Provenance consumes the same bounded prompt space as lesson content. A passing
// evaluation cannot justify an export that loses (or adds) selected entries.
export async function assertPromotionSelection({ candidate, exercise }, promoted) {
  const before = await validateBundle(candidateBundle(candidate, '1970-01-01'), exercise.platformVersion);
  const after = await validateBundle(promoted, exercise.platformVersion);
  const semantics = (entries) => entries.map(({ verifiedAt, sources, ...entry }) => entry);
  for (const scenario of exercise.scenarios) {
    const context = scenario.context;
    // Include both consumer paths: Catlas selects entries directly, while the
    // Orchestrator also bounds the assembled role/scope/goal envelope.
    assert.deepEqual(
      semantics(selectProductKnowledge(after[context.locale].bundle, context)),
      semantics(selectProductKnowledge(before[context.locale].bundle, context)),
      'Promotion changed selected knowledge; shorten the proposal and evaluate it again.',
    );
    assert.deepEqual(
      semantics(assembleProductKnowledgeContext(after[context.locale], context).entries),
      semantics(assembleProductKnowledgeContext(before[context.locale], context).entries),
      'Promotion changed delivered knowledge; shorten the proposal and evaluate it again.',
    );
  }
}

async function loadForConsumer(bundle, { consumer, locale = 'en', platformVersion = PLATFORM_VERSION }) {
  assert.ok(Object.hasOwn(consumers, consumer), 'Select catlas or orchestrator.');
  assert.ok(bundle.entries.some((entry) => entry.roles.includes(consumer)), 'Bundle has no knowledge for this consumer.');
  const root = await mkdtemp(join(tmpdir(), 'cats-reviewed-knowledge-'));
  try {
    const filePath = join(root, 'knowledge.json'); await writeNew(filePath, bundle);
    return await loadProductKnowledge({ filePath, platformVersion, capabilities: consumers[consumer], locale });
  } finally { await rm(root, { recursive: true, force: true }); }
}

/** No retained cache: each read revalidates approval and the revocation boundary. */
export class ReviewedKnowledgeStore {
  constructor(runRoot, options) { this.runRoot = runRoot; this.options = options; }
  async read(locale = 'en') {
    if (await hasRecord(this.runRoot, 'revocation.json')) return { status: 'missing', reason: 'revoked' };
    const { bundle } = await reviewedBundle(this.runRoot, this.options.audience ?? 'product');
    const result = await loadForConsumer(bundle, { ...this.options, locale });
    if (await hasRecord(this.runRoot, 'revocation.json')) return { status: 'missing', reason: 'revoked' };
    return result;
  }
}

export async function exportKnowledge({ runRoot, outputRoot, consumer, platformVersion = PLATFORM_VERSION,
  audience: targetAudience = 'product' }) {
  const { bundle, verified, review } = await reviewedBundle(runRoot, targetAudience);
  for (const locale of ['en', 'zh-TW']) {
    assert.equal((await loadForConsumer(bundle, { consumer, platformVersion, locale })).status, 'ready', 'Knowledge is incompatible with the actual consumer.');
  }
  // A new directory prevents replacing installed config or a prior export.
  await mkdir(outputRoot, { recursive: false, mode: 0o700 });
  const bundleBytes = `${canonical(bundle)}\n`;
  const receipt = { schemaVersion: 1, candidateDigest: verified.candidate.digest,
    evaluationDigest: digest(verified.evaluation), reviewDigest: digest(review),
    bundleDigest: digest(bundleBytes), consumer, platformVersion, audience: targetAudience,
    publicationEligible: targetAudience === 'product', exportedAt: new Date().toISOString() };
  await writeNew(join(outputRoot, 'knowledge.json'), bundleBytes);
  // Linearization point: a revocation observed here denies export. A concurrent
  // revocation after this read applies to subsequent exports/reads; this export
  // is already a historical snapshot even if its receipt is still being flushed.
  assert.ok(!await hasRecord(runRoot, 'revocation.json'), 'Revoked during export; partial output is not approved.');
  await writeNew(join(outputRoot, 'export-receipt.json'), receipt);
  return receipt;
}

export async function revokeKnowledge({ runRoot, actorId, reason }) {
  id(actorId); safeText(reason, 2_000);
  const admission = await readRecord(runRoot, 'admission.json');
  if (await hasRecord(runRoot, 'revocation.json')) return readRecord(runRoot, 'revocation.json');
  // Revocation remains available even after a tool upgrade invalidates old evaluation inputs.
  return writeRecord(runRoot, 'revocation.json', { schemaVersion: 1, runId: admission.runId,
    actorId, reason, revokedAt: new Date().toISOString() });
}
