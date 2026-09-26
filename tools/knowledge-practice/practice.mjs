import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { loadProductKnowledge, assembleProductKnowledgeContext } from '../../build/server/platform/knowledge/productKnowledge.js';
import { assertSeparated, canonical, digest, evidenceIds, fields, hasRecord, id, integer,
  readJson, readPlain, readRecord, safeText, writeNew, writeRecord } from './artifacts.mjs';
import { candidateBundle, readCandidate } from './candidate.mjs';
import { assertKnowledgeChanges, baselineKnowledge, preservationCheck, PRESERVATION_CHECK,
  validateChangeScope } from './changes.mjs';

const TOOL_ROOT = fileURLToPath(new URL('.', import.meta.url));
export async function engineDigest() {
  const entries = {};
  for (const name of (await readdir(TOOL_ROOT)).filter((name) => name.endsWith('.mjs')).sort()) {
    entries[name] = digest(await readPlain(join(TOOL_ROOT, name)));
  }
  entries.productionLoader = digest(await readPlain(fileURLToPath(new URL('../../build/server/platform/knowledge/productKnowledge.js', import.meta.url))));
  return digest(entries);
}

export function validateExercise(spec) {
  fields(spec, ['schemaVersion', 'id', 'revision', 'evidenceMode', 'platformVersion', 'capabilities', 'budget', 'metric', 'repeats', 'scenarios', 'changeScope']);
  assert.equal(spec.schemaVersion, 1); id(spec.id); id(spec.revision);
  assert.ok(['fixture', 'product'].includes(spec.evidenceMode));
  if (spec.evidenceMode === 'product' || spec.changeScope !== undefined) validateChangeScope(spec.changeScope);
  assert.match(spec.platformVersion, /^\d+\.\d+\.\d+$/u);
  assert.ok(Array.isArray(spec.capabilities) && spec.capabilities.length > 0 && spec.capabilities.length <= 16);
  spec.capabilities.forEach(id);
  fields(spec.budget, ['maxAttempts', 'maxElapsedMs', 'attemptTimeoutMs', 'maxTokens']);
  integer(spec.budget.maxAttempts, 1, 384); integer(spec.budget.maxElapsedMs, 1, 3_600_000);
  integer(spec.budget.attemptTimeoutMs, 1, spec.budget.maxElapsedMs); integer(spec.budget.maxTokens, 1, 1_000_000);
  fields(spec.metric, ['name', 'minimumImprovement']);
  assert.ok(['passedChecks', 'elapsedMs', 'tokens', 'interventions'].includes(spec.metric.name));
  assert.ok(Number.isFinite(spec.metric.minimumImprovement) && spec.metric.minimumImprovement > 0);
  integer(spec.repeats, 3, 6);
  assert.ok(Array.isArray(spec.scenarios) && spec.scenarios.length >= 10 && spec.scenarios.length <= 32);
  assert.ok(spec.scenarios.filter((item) => item.heldOut === true).length >= 4, 'At least four held-out scenarios are required.');
  const seen = new Set();
  for (const item of spec.scenarios) {
    fields(item, ['id', 'heldOut', 'fixture', 'context', 'checks']); id(item.id);
    assert.ok(!seen.has(item.id)); seen.add(item.id); assert.equal(typeof item.heldOut, 'boolean');
    assert.ok(Buffer.byteLength(canonical(item.fixture)) <= 16_384, 'Fixture exceeds its input budget.');
    fields(item.context, ['role', 'surface', 'locale', 'goal', 'scope', 'topics', 'operations']);
    assert.ok(['catlas', 'orchestrator'].includes(item.context.role));
    assert.ok(['code-help', 'chat-visible', 'chat-decision'].includes(item.context.surface));
    assert.ok(['en', 'zh-TW'].includes(item.context.locale)); safeText(item.context.goal);
    assert.ok(item.context.scope && typeof item.context.scope === 'object' && !Array.isArray(item.context.scope));
    assert.ok(Buffer.byteLength(canonical(item.context.scope)) <= 6_000, 'Observation scope exceeds its budget.');
    assert.ok(Array.isArray(item.context.topics) && item.context.topics.length <= 8);
    item.context.topics.forEach(id);
    assert.ok(Array.isArray(item.context.operations) && item.context.operations.length <= 64);
    for (const operation of item.context.operations) {
      fields(operation, ['id', 'version']); id(operation.id); assert.match(operation.version, /^\d+\.\d+(?:\.\d+)?$/u);
    }
    assert.ok(Array.isArray(item.checks) && item.checks.length > 0 && item.checks.length <= 16);
    assert.ok(item.checks.some((check) => check.critical === true));
    const checks = new Set();
    for (const check of item.checks) {
      fields(check, ['id', 'kind', 'critical', 'path', 'equals']); id(check.id);
      assert.notEqual(check.id, PRESERVATION_CHECK, 'Reserved engine check ID.');
      assert.ok(!checks.has(check.id)); checks.add(check.id);
      assert.ok(['correctness', 'policy'].includes(check.kind)); assert.equal(typeof check.critical, 'boolean');
      assert.ok(typeof check.path === 'string' && /^\/(?:[a-zA-Z0-9_-]+\/?)+$/u.test(check.path));
      assert.ok(Object.hasOwn(check, 'equals') && Buffer.byteLength(canonical(check.equals)) <= 4_096);
    }
  }
  return spec;
}

export async function admitPractice({ runRoot, authorRoots, exerciseFile, baselineFile, evaluatorFile, evaluatorId, runtimeRoot }) {
  id(evaluatorId);
  runRoot = resolve(runRoot);
  await assertSeparated(authorRoots, [runRoot, exerciseFile, baselineFile, evaluatorFile, TOOL_ROOT]);
  const packageRoot = resolve(runtimeRoot);
  assert.equal((await readJson(join(packageRoot, 'package.json'))).name, '@cats-inc/cats-runtime');
  const policyModule = await import(pathToFileURL(join(packageRoot, 'build/runtime/core/skills/contentPolicy.js')).href);
  const policy = policyModule.getRuntimeSkillContentPolicy();
  assert.equal(policy.profile, 'preview', 'Practice requires an explicit preview Runtime artifact.');
  const exercise = validateExercise(await readJson(exerciseFile));
  const baseline = await readJson(baselineFile, 128 * 1024);
  const evaluator = (await readPlain(evaluatorFile, 64 * 1024)).toString('utf8');
  const baselineResult = await loadProductKnowledge({ filePath: baselineFile,
    platformVersion: exercise.platformVersion, capabilities: exercise.capabilities, locale: 'en' });
  assert.equal(baselineResult.status, 'ready', 'Baseline is incompatible with the frozen exercise.');
  if (exercise.changeScope !== undefined) {
    validateChangeScope(exercise.changeScope, baselineKnowledge(baseline));
    for (const locale of ['en', 'zh-TW']) {
      const result = locale === 'en' ? baselineResult : await loadProductKnowledge({ filePath: baselineFile,
        platformVersion: exercise.platformVersion, capabilities: exercise.capabilities, locale });
      assert.equal(result.status, 'ready', 'Baseline must support both evaluation locales.');
      const covered = new Set(exercise.scenarios.filter(scenario => scenario.context.locale === locale)
        .flatMap(scenario => assembleProductKnowledgeContext(result, scenario.context).entries.map(entry => entry.id)));
      assert.ok(result.bundle.entries.every(entry => covered.has(entry.id)),
        `Preservation scenarios must deliver every baseline entry in ${locale}.`);
    }
  }
  await mkdir(runRoot, { recursive: false, mode: 0o700 });
  await writeNew(join(runRoot, '.receipt-key'), randomBytes(32).toString('hex'));
  await writeNew(join(runRoot, 'exercise.json'), exercise);
  await writeNew(join(runRoot, 'baseline.json'), baseline);
  await writeNew(join(runRoot, 'evaluator.mjs'), evaluator);
  return writeRecord(runRoot, 'admission.json', {
    schemaVersion: 1, runId: randomUUID(), evaluatorId, admittedAt: new Date().toISOString(),
    policyFingerprint: policy.fingerprint, evidenceMode: exercise.evidenceMode,
    engineDigest: await engineDigest(), exerciseDigest: digest(exercise), baselineDigest: digest(baseline),
    evaluatorDigest: digest(evaluator), authorRoots: await Promise.all(authorRoots.map(async (root) => resolve(root))),
  });
}

export async function frozenInputs(runRoot) {
  const admission = await readRecord(runRoot, 'admission.json');
  assert.equal(admission.schemaVersion, 1);
  assert.equal(admission.engineDigest, await engineDigest(), 'Evaluator engine changed; create a new admission.');
  const exercise = validateExercise(await readJson(join(runRoot, 'exercise.json')));
  const baseline = await readJson(join(runRoot, 'baseline.json'), 128 * 1024);
  assert.equal(digest(exercise), admission.exerciseDigest, 'Exercise changed.');
  assert.equal(digest(baseline), admission.baselineDigest, 'Baseline changed.');
  assert.equal(digest(await readPlain(join(runRoot, 'evaluator.mjs'))), admission.evaluatorDigest, 'Evaluator changed.');
  return { admission, exercise, baseline };
}

async function attemptInWorker(modulePath, input, timeoutMs, signal) {
  if (signal?.aborted) return { error: 'interrupted', notStarted: true };
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), {
    workerData: { modulePath, input }, resourceLimits: { maxOldGenerationSizeMb: 128 },
  });
  let timer, grace;
  let stopped;
  const stop = (reason) => {
    stopped ??= reason;
    worker.postMessage('abort');
    grace ??= setTimeout(() => { void worker.terminate(); }, 250);
  };
  const abort = () => stop('interrupted');
  try {
    return await new Promise((resolveResult) => {
      let finished = false;
      const finish = (value) => { if (!finished) { finished = true; resolveResult(value); } };
      worker.once('message', (message) => finish(stopped ? { ...message, error: stopped } : message));
      worker.once('error', () => finish({ error: stopped ?? 'evaluator_error' }));
      worker.once('exit', () => finish({ error: stopped ?? 'evaluator_error' }));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => stop('timeout'), timeoutMs);
      if (signal?.aborted) abort();
    });
  } finally {
    clearTimeout(timer); clearTimeout(grace); signal?.removeEventListener('abort', abort);
    await worker.terminate();
  }
}

function checkObservation(result, checks) {
  fields(result, ['observed', 'usageTokens', 'interventions', 'evidenceRefs', 'cleanup']);
  assert.ok(Buffer.byteLength(canonical(result.observed)) <= 32_768, 'Observation exceeds its budget.');
  // Receipts contain assertions/digests, not automatic raw transcript capture.
  assert.equal(result.cleanup, 'complete', 'Evaluator cleanup was not confirmed.');
  integer(result.interventions, 0, 1_000); evidenceIds(result.evidenceRefs);
  if (result.usageTokens !== null) integer(result.usageTokens, 0, Number.MAX_SAFE_INTEGER);
  return checks.map((check) => {
    let observed = result.observed;
    for (const key of check.path.slice(1).split('/')) {
      observed = observed && typeof observed === 'object' && Object.hasOwn(observed, key) ? observed[key] : undefined;
    }
    return { id: check.id, kind: check.kind, critical: check.critical,
      passed: observed !== undefined && canonical(observed) === canonical(check.equals) };
  });
}

export function compareAttempts(exercise, attempts, stopReason) {
  const candidate = attempts.filter((row) => row.phase === 'candidate');
  const baseline = attempts.filter((row) => row.phase === 'baseline');
  const complete = !stopReason && attempts.length === exercise.scenarios.length * exercise.repeats * 2
    && attempts.every((row) => row.checks && row.tokens !== null);
  const criticalPassed = complete && candidate.every((row) => row.checks.every((check) => !check.critical || check.passed));
  const noRegression = complete && candidate.every((row) => {
    const prior = baseline.find((item) => item.scenarioId === row.scenarioId && item.repeat === row.repeat);
    return prior.checks.every((check) => !check.passed || row.checks.find((item) => item.id === check.id)?.passed);
  });
  const score = (rows) => rows.reduce((sum, row) => sum + (exercise.metric.name === 'passedChecks'
    ? (row.checks?.filter((check) => check.passed).length ?? 0) : row[exercise.metric.name] ?? 0), 0);
  const scores = { baseline: score(baseline), candidate: score(candidate) };
  const improvement = exercise.metric.name === 'passedChecks' ? scores.candidate - scores.baseline : scores.baseline - scores.candidate;
  const improved = complete && improvement >= exercise.metric.minimumImprovement;
  return { complete, criticalPassed, noRegression, improved, scores, improvement,
    gatesPassed: complete && criticalPassed && noRegression && improved };
}

export async function evaluatePractice({ runRoot, candidateFile, signal }) {
  const { admission, exercise, baseline } = await frozenInputs(runRoot);
  assert.ok(!await hasRecord(runRoot, 'evaluation-started.json'), 'This run already started. Inspect retained evidence; do not replay it.');
  const candidate = await readCandidate(candidateFile);
  assert.notEqual(candidate.draft.authorId, admission.evaluatorId, 'Author cannot evaluate their own candidate.');
  const startedAt = Date.now();
  const monotonicStart = performance.now();
  // Capture intent precedes every candidate write, including compatibility failures.
  await writeRecord(runRoot, 'evaluation-started.json', {
    runId: admission.runId, candidateDigest: candidate.digest, startedAt,
  });
  await writeNew(join(runRoot, 'candidate.json'), candidate);
  await writeNew(join(runRoot, 'candidate-bundle.json'), candidateBundle(candidate, '1970-01-01'));
  const bundles = {};
  for (const phase of ['baseline', 'candidate']) for (const locale of ['en', 'zh-TW']) {
    bundles[`${phase}:${locale}`] = await loadProductKnowledge({
      filePath: join(runRoot, phase === 'baseline' ? 'baseline.json' : 'candidate-bundle.json'),
      platformVersion: exercise.platformVersion, capabilities: exercise.capabilities, locale,
    });
    assert.equal(bundles[`${phase}:${locale}`].status, 'ready', 'Practice knowledge is incompatible.');
  }
  if (exercise.changeScope !== undefined) assertKnowledgeChanges(baselineKnowledge(baseline),
    candidate.draft.knowledge, exercise.changeScope, candidate.draft.evidenceRefs);
  const attempts = [];
  let stopReason = null, tokens = 0;
  outer: for (const scenario of exercise.scenarios) for (let repeat = 0; repeat < exercise.repeats; repeat++) {
    for (const phase of ['baseline', 'candidate']) {
      if (signal?.aborted) { stopReason = 'interrupted'; break outer; }
      const remainingMs = exercise.budget.maxElapsedMs - (performance.now() - monotonicStart);
      if (attempts.length >= exercise.budget.maxAttempts || remainingMs <= 0 || tokens >= exercise.budget.maxTokens) {
        stopReason = 'budget_exhausted'; break outer;
      }
      const attemptId = String(attempts.length + 1).padStart(4, '0');
      const resetId = randomUUID();
      const fixtureRoot = join(runRoot, 'resets', resetId);
      await mkdir(fixtureRoot, { recursive: true });
      const intent = { runId: admission.runId, candidateDigest: candidate.digest, attemptId,
        scenarioId: scenario.id, repeat, phase, resetId, startedAt: Date.now() };
      await writeRecord(runRoot, `intent-${attemptId}.json`, intent);
      const context = assembleProductKnowledgeContext(bundles[`${phase}:${scenario.context.locale}`], scenario.context);
      const attemptStart = performance.now();
      const response = attemptStart - monotonicStart >= exercise.budget.maxElapsedMs
        ? { error: 'budget_exhausted', notStarted: true } : await attemptInWorker(join(runRoot, 'evaluator.mjs'), {
        fixture: scenario.fixture, fixtureRoot, resetId, context,
      }, Math.min(exercise.budget.attemptTimeoutMs, exercise.budget.maxElapsedMs - (attemptStart - monotonicStart)), signal);
      // Charge known provider usage even if cleanup, parsing or evidence validation fails.
      const measured = response.result?.usageTokens;
      const measuredTokens = response.notStarted ? 0
        : Number.isSafeInteger(measured) && measured >= 0 ? measured : null;
      let row = { ...intent, elapsedMs: Math.ceil(performance.now() - attemptStart), tokens: measuredTokens,
        interventions: 0, failureClass: response.error ?? null, checks: null };
      try {
        await frozenInputs(runRoot);
        assert.equal((await readCandidate(join(runRoot, 'candidate.json'))).digest, candidate.digest);
        if (!response.error) {
          const checks = checkObservation(response.result, scenario.checks);
          if (exercise.changeScope !== undefined) checks.push(preservationCheck(
            bundles[`baseline:${scenario.context.locale}`], bundles[`${phase}:${scenario.context.locale}`],
            scenario.context, exercise.changeScope));
          row = { ...row, checks,
            interventions: response.result.interventions, evidenceRefs: response.result.evidenceRefs,
            observationDigest: digest(response.result.observed), contextDigest: context.contextDigest,
            failureClass: checks.some((check) => check.critical && !check.passed) ? 'critical_failed'
              : checks.some((check) => !check.passed) ? 'assertion_failed' : null };
          if (row.tokens === null) row.failureClass = 'unknown_usage';
        }
      } catch { row.failureClass = 'invalid_or_changed_evidence'; row.checks = null; }
      tokens += row.tokens ?? 0;
      await writeRecord(runRoot, `attempt-${attemptId}.json`, row);
      attempts.push(row);
      if (!row.checks || row.tokens === null) { stopReason = row.failureClass; break outer; }
      if (tokens > exercise.budget.maxTokens || performance.now() - monotonicStart > exercise.budget.maxElapsedMs) {
        stopReason = 'budget_exhausted'; break outer;
      }
    }
  }
  const comparison = compareAttempts(exercise, attempts, stopReason);
  const evaluation = { schemaVersion: 1, runId: admission.runId, candidateDigest: candidate.digest,
    exerciseDigest: admission.exerciseDigest, evaluatorDigest: admission.evaluatorDigest,
    engineDigest: admission.engineDigest, evaluatorId: admission.evaluatorId,
    evidenceMode: admission.evidenceMode, finishedAt: new Date().toISOString(),
    attempts: attempts.map((row) => ({ attemptId: row.attemptId, digest: digest(row) })),
    elapsedMs: Math.ceil(performance.now() - monotonicStart),
    usage: { measuredTokens: tokens, tokensComplete: attempts.every((row) => row.tokens !== null) }, stopReason, comparison,
    productionEligible: comparison.gatesPassed && admission.evidenceMode === 'product' };
  await writeRecord(runRoot, 'evaluation.json', evaluation);
  const trainingIds = new Set(exercise.scenarios.filter((item) => !item.heldOut).map((item) => item.id));
  const feedback = { candidateDigest: candidate.digest, completedAttempts: attempts.length,
    stopReason, gatesPassed: comparison.gatesPassed, productionEligible: evaluation.productionEligible,
    trainingFailures: attempts.filter((row) => row.phase === 'candidate' && row.failureClass && trainingIds.has(row.scenarioId))
      .map((row) => ({ scenarioId: row.scenarioId, failureClass: row.failureClass })),
    heldOutGate: attempts.some((row) => row.phase === 'candidate' && !trainingIds.has(row.scenarioId) && row.failureClass) ? 'failed' : comparison.complete ? 'passed' : 'incomplete' };
  await writeRecord(runRoot, 'feedback.json', feedback);
  return feedback;
}

export async function inspectPractice(runRoot) {
  const admission = await readRecord(runRoot, 'admission.json');
  const evaluation = await hasRecord(runRoot, 'evaluation.json') ? await readRecord(runRoot, 'evaluation.json') : null;
  const review = await hasRecord(runRoot, 'review.json') ? await readRecord(runRoot, 'review.json') : null;
  const revoked = await hasRecord(runRoot, 'revocation.json');
  return { runId: admission.runId, evidenceMode: admission.evidenceMode,
    status: evaluation ? 'evaluated' : await hasRecord(runRoot, 'evaluation-started.json') ? 'incomplete-no-replay' : 'admitted',
    attempts: evaluation?.attempts.length ?? (await readdir(runRoot)).filter((name) => /^attempt-\d+\.json$/u.test(name)).length,
    stopReason: evaluation?.stopReason ?? null, gatesPassed: evaluation?.comparison.gatesPassed ?? false,
    productionEligible: evaluation?.productionEligible ?? false,
    // Historical evidence and current eligibility are separate; inspection never
    // authenticates all attempt inputs or silently re-executes an old engine.
    engineCurrent: admission.engineDigest === await engineDigest(),
    review: review ? { decision: review.decision, audience: review.audience, reviewerId: review.reviewerId } : null,
    revoked };
}
