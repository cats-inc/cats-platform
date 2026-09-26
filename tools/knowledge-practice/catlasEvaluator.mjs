import assert from 'node:assert/strict';
import { join } from 'node:path';
import { inferCatlasAdvice } from '../../build/server/platform/catlas/inference.js';
import { selectCatlasKnowledge } from '../../build/server/platform/catlas/knowledge.js';
import { assembleProductKnowledgeContext } from '../../build/server/platform/knowledge/productKnowledge.js';
import { validateRuntimeSessionPolicyInput } from '../../build/server/shared/runtimeSessionPolicy.js';
import { canonical, digest, evidenceIds, fields, id, physical, safeText, writeNew } from './artifacts.mjs';

const TOPICS = ['execution', 'workspace', 'permissions', 'recovery'];

export function validateCatlasEvaluationFixture(fixture) {
  fields(fixture, ['question', 'observation', 'rubricId']);
  safeText(fixture.question, 1_000); id(fixture.rubricId);
  const observation = fixture.observation;
  fields(observation, ['surface', 'observedAt', 'runtimeReachable', 'draftTarget',
    'targetAvailability', 'workspace', 'requestedPolicy', 'effectiveSessionAccess']);
  assert.equal(observation.surface, 'code:new'); assert.equal(observation.runtimeReachable, true);
  assert.equal(observation.effectiveSessionAccess, 'not_started');
  assert.ok(typeof observation.observedAt === 'string' && Number.isFinite(Date.parse(observation.observedAt)));
  if (observation.draftTarget !== null) {
    fields(observation.draftTarget, ['provider', 'instance', 'model']);
    safeText(observation.draftTarget.provider, 100);
    for (const key of ['instance', 'model']) if (observation.draftTarget[key] !== null) safeText(observation.draftTarget[key], 100);
  }
  assert.ok((observation.draftTarget === null ? ['unselected'] : ['ok', 'degraded', 'unavailable', 'unknown'])
    .includes(observation.targetAvailability), 'Availability must describe the selected draft target.');
  fields(observation.workspace, ['selection', 'inspectionHost', 'gitStatus']);
  assert.ok(['unselected', 'directory', 'unavailable', 'remote_unverified'].includes(observation.workspace.selection));
  assert.equal(observation.workspace.inspectionHost, 'platform'); assert.equal(observation.workspace.gitStatus, 'unknown');
  fields(observation.requestedPolicy, ['workspaceKind', 'workspaceAccess', 'permissionMode']);
  for (const key of ['workspaceKind', 'workspaceAccess', 'permissionMode']) safeText(observation.requestedPolicy[key], 80);
  assert.equal(validateRuntimeSessionPolicyInput(observation.requestedPolicy), null, 'Invalid requested session policy.');
  safeText(canonical(observation), 6_000);
  return fixture;
}

function validateJudgment(value, responseDigest, reviewerId, criteria, advice) {
  fields(value, ['reviewerId', 'responseDigest', 'decisions', 'usageTokens']);
  assert.ok(Number.isSafeInteger(value.usageTokens) && value.usageTokens >= 0, 'Reviewer usage is unknown.');
  assert.equal(value.reviewerId, reviewerId); assert.equal(value.responseDigest, responseDigest, 'Stale semantic judgment.');
  assert.ok(Array.isArray(value.decisions));
  assert.deepEqual(value.decisions.map(item => item.id).sort(), criteria.map(item => item.id).sort());
  for (const decision of value.decisions) {
    fields(decision, ['id', 'verdict', 'rationale', 'evidenceSpans']);
    assert.ok(['pass', 'fail'].includes(decision.verdict), 'Semantic judgment is incomplete.'); safeText(decision.rationale, 2_000);
    assert.ok(Array.isArray(decision.evidenceSpans) && decision.evidenceSpans.length <= 8);
    if (decision.verdict === 'pass') assert.ok(decision.evidenceSpans.length > 0, 'A passing judgment needs response evidence.');
    for (const span of decision.evidenceSpans) {
      fields(span, ['start', 'end']);
      assert.ok(Number.isSafeInteger(span.start) && Number.isSafeInteger(span.end)
        && span.start >= 0 && span.end > span.start && span.end <= advice.length, 'Invalid response evidence span.');
    }
  }
  return value;
}

async function abortable(pending, signal) {
  let abort;
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      abort = () => reject(new Error('Assessment interrupted.'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    })]);
  } finally { signal.removeEventListener('abort', abort); }
}

/**
 * Trusted evaluator helper, not a CLI or inference authorization.
 * The native harness supplies an owned Runtime client, frozen knowledge/rubric,
 * independent semantic reviewer and process-cleanup observer. No defaults invoke
 * providers or read user authentication. Public doubles only test this plumbing.
 */
export function createCatlasEvaluator({ evaluationRoot, runtimeClient, guideCat, authorId, reviewerId,
  loadKnowledge, resolveRubric, judge, confirmCleanup }) {
  id(authorId); id(reviewerId); assert.notEqual(authorId, reviewerId, 'Author cannot judge their own advice.');
  for (const callback of [loadKnowledge, resolveRubric, judge, confirmCleanup]) assert.equal(typeof callback, 'function');
  const binding = structuredClone(guideCat);
  for (const key of ['provider', 'instance', 'model']) safeText(binding.executionTarget[key], 100);
  return async function attempt({ fixture: rawFixture, fixtureRoot, resetId, context: rawContext, signal }) {
    const fixture = structuredClone(validateCatlasEvaluationFixture(rawFixture));
    const context = structuredClone(rawContext);
    assert.match(resetId, /^[a-f0-9-]{36}$/u);
    assert.equal(await physical(fixtureRoot), join(await physical(evaluationRoot), 'resets', resetId));
    assert.equal(context.role, 'catlas'); assert.equal(context.surface, 'code-help');
    assert.ok(['en', 'zh-TW'].includes(context.locale));
    assert.equal(context.goal, fixture.question); assert.equal(canonical(context.scope), canonical(fixture.observation));
    assert.deepEqual(context.operations, []);
    const knowledge = await loadKnowledge(context.bundle?.digest, context.locale);
    assert.equal(knowledge.status, 'ready');
    assert.equal(knowledge.bundle.digest, context.bundle.digest); assert.equal(knowledge.bundle.locale, context.locale);
    const expected = assembleProductKnowledgeContext(knowledge, { role: 'catlas', surface: 'code-help', locale: context.locale,
      goal: fixture.question, scope: fixture.observation, topics: TOPICS, operations: [] });
    assert.equal(canonical(context), canonical(expected), 'Evaluation context differs from the frozen product inputs.');
    const criteria = structuredClone(await resolveRubric(fixture.rubricId));
    assert.ok(Array.isArray(criteria) && criteria.length > 0 && criteria.length <= 14);
    for (const criterion of criteria) { fields(criterion, ['id', 'criterion']); id(criterion.id); safeText(criterion.criterion, 4_000); }
    assert.equal(new Set(criteria.map(item => item.id)).size, criteria.length);
    signal.throwIfAborted();
    const entries = selectCatlasKnowledge(knowledge.bundle, TOPICS);
    assert.ok(entries.length > 0);
    await writeNew(join(fixtureRoot, 'catlas-intent.json'), { resetId, contextDigest: context.contextDigest,
      rubricDigest: digest(criteria), target: binding.executionTarget, reviewerId, authorId });
    let session = null, creating = false, createSettled = false, sent = false, tokens = 0, closed = false, closing = null;
    let deliveryValid = true;
    let advice = null, failure = null, cleanup = 'incomplete', cleanupRefs = [];
    async function closeOwnedSession(cancel = false) {
      if (!session) return;
      if (cancel) await runtimeClient.cancelSession(session.id).catch(() => {});
      if (!closed) {
        closing ??= Promise.resolve().then(() => runtimeClient.closeSession(session.id)).then(() => { closed = true; })
          .finally(() => { closing = null; });
        await closing;
      }
    }
    async function cleanupEvidence(input) {
      const observed = await confirmCleanup({ resetId, ...input });
      fields(observed, ['status', 'evidenceRefs']); evidenceIds(observed.evidenceRefs);
      assert.ok(['complete', 'incomplete'].includes(observed.status));
      return observed;
    }
    async function observe() {
      const { session: actual } = await runtimeClient.observeSession(session.id);
      assert.equal(actual.id, session.id); assert.equal(actual.providerName, binding.executionTarget.provider);
      assert.equal(actual.model, binding.executionTarget.model);
      assert.equal(actual.providerTarget?.resolved, true);
      assert.equal(actual.providerTarget.provider, binding.executionTarget.provider);
      assert.equal(actual.providerTarget.target, binding.executionTarget.instance);
      assert.equal(actual.workspace?.kind, 'sandbox'); assert.equal(actual.workspace.access, 'read_only');
      assert.equal(actual.permissionMode, 'default'); assert.equal(actual.skills?.strict, true);
      assert.deepEqual(actual.skills.requestedSkills, []); assert.deepEqual(actual.skills.appliedSkillIds, []);
    }
    const tracked = {
      async createSession(input) {
        signal.throwIfAborted();
        creating = true;
        await writeNew(join(fixtureRoot, 'catlas-create.json'), { resetId, inputDigest: digest(input),
          requestId: input.context.metadata.requestId, target: binding.executionTarget });
        signal.throwIfAborted();
        const pending = (async () => {
          try {
            session = await runtimeClient.createSession(input);
            await writeNew(join(fixtureRoot, 'catlas-session.json'), { resetId, sessionId: session.id });
            return session;
          } finally {
            createSettled = true;
            // A create response can arrive after abortable() returned. Fence sends and
            // clean it while this worker lives; external reconciliation is still
            // required if the worker is forcibly terminated before it can do so.
            if (session && signal.aborted) {
              await closeOwnedSession(true);
              await writeNew(join(fixtureRoot, 'catlas-late-create.json'), { resetId, sessionId: session.id,
                closeAcknowledged: closed, cleanup: 'unconfirmed' });
            }
          }
        })();
        return abortable(pending, signal);
      },
      async sendMessage(sessionId, content, input) {
        assert.equal(sessionId, session.id); await observe(); signal.throwIfAborted();
        await writeNew(join(fixtureRoot, 'catlas-send.json'), { resetId, sessionId, inputDigest: digest({ content, input }) });
        signal.throwIfAborted();
        sent = true; tokens = null;
        const response = await runtimeClient.sendMessage(sessionId, content, input);
        tokens = Number.isSafeInteger(response.tokensUsed) && response.tokensUsed > 0 ? response.tokensUsed : null;
        await writeNew(join(fixtureRoot, 'catlas-usage.json'), { resetId, sessionId, tokens });
        return response;
      },
      cancelSession: sessionId => runtimeClient.cancelSession(sessionId),
      async closeSession(sessionId) {
        assert.equal(sessionId, session.id);
        try { await observe(); } catch { deliveryValid = false; }
        await closeOwnedSession();
      },
    };
    try {
      advice = await inferCatlasAdvice({ runtimeClient: tracked, guideCat: binding, locale: context.locale,
        question: fixture.question, observation: fixture.observation, surface: 'code:new',
        bundle: knowledge.bundle, entries, signal });
      safeText(advice.advice, 5_000);
      assert.ok(deliveryValid && sent && tokens !== null && tokens > 0);
      assert.equal(advice.receipt.sessionCleanup, 'closed'); signal.throwIfAborted();
    } catch { advice = null; failure = 'inference_or_delivery_failed'; }
    finally {
      if (session && !closed) await closeOwnedSession(signal.aborted).catch(() => {});
      try {
        const sessionId = session?.id ?? null;
        const observed = await cleanupEvidence({ stage: 'catlas', sessionId, creating, createSettled, sent, closeAcknowledged: closed });
        if (sessionId && createSettled && observed.status === 'complete') { cleanup = 'complete'; cleanupRefs = observed.evidenceRefs; }
      } catch { /* Unconfirmed process cleanup cannot pass. */ }
    }
    let judgment = null, reviewerTokens = 0, reviewerStarted = false, reviewerSettled = false;
    const catlasCleanup = cleanup;
    if (advice && cleanup === 'complete' && !signal.aborted) {
      const response = { resetId, locale: context.locale, question: fixture.question, observation: fixture.observation,
        advice: advice.advice, knowledgeIds: advice.knowledgeIds };
      const responseDigest = digest(response);
      try {
        await writeNew(join(fixtureRoot, 'assessment-request.json'), { response, responseDigest, criteria });
        signal.throwIfAborted(); reviewerTokens = null; reviewerStarted = true; cleanup = 'incomplete';
        const pending = Promise.resolve().then(() => {
          signal.throwIfAborted();
          return judge({ response: structuredClone(response), responseDigest, criteria: structuredClone(criteria), signal });
        }).then(async value => {
          reviewerTokens = Number.isSafeInteger(value?.usageTokens) && value.usageTokens >= 0 ? value.usageTokens : null;
          await writeNew(join(fixtureRoot, 'assessment-usage.json'), { resetId, reviewerTokens });
          return value;
        }).finally(() => { reviewerSettled = true; });
        judgment = validateJudgment(structuredClone(await abortable(pending, signal)),
          responseDigest, reviewerId, criteria, advice.advice);
        signal.throwIfAborted();
        await writeNew(join(fixtureRoot, 'assessment-result.json'), judgment);
      } catch { judgment = null; failure = 'semantic_judgment_incomplete'; }
      finally {
        if (reviewerStarted) try {
          const observed = await cleanupEvidence({ stage: 'reviewer', reviewerId, responseDigest,
            started: reviewerStarted, settled: reviewerSettled });
          if (reviewerSettled && observed.status === 'complete') { cleanup = catlasCleanup; cleanupRefs.push(...observed.evidenceRefs); }
        } catch { /* A completed answer or cancellation acknowledgement is not process-cleanup evidence. */ }
      }
    }
    const semantic = Object.fromEntries(criteria.map(criterion => [criterion.id,
      judgment?.decisions.find(decision => decision.id === criterion.id)?.verdict === 'pass']));
    const usageTokens = tokens === null || reviewerTokens === null ? null : tokens + reviewerTokens;
    const result = { observed: { responseValid: advice !== null && judgment !== null, semantic }, usageTokens,
      knownTokens: (tokens ?? 0) + (reviewerTokens ?? 0),
      interventions: 0, cleanup, evidenceRefs: [`evaluation:${resetId}`, ...cleanupRefs.slice(0, 7)] };
    result.complete = result.observed.responseValid && usageTokens !== null && cleanup === 'complete';
    try {
      await writeNew(join(fixtureRoot, 'catlas-result.json'), { resetId, contextDigest: context.contextDigest,
        selectedEntries: entries.map(({ id, revision, digest }) => ({ id, revision, digest })),
        receipt: advice?.receipt ?? null, judgmentDigest: judgment ? digest(judgment) : null,
        usage: { catlasTokens: tokens, reviewerTokens }, catlasCleanup, reviewerStarted, reviewerSettled, failure, result });
    } catch { result.observed.responseValid = false; result.complete = false; }
    return result;
  };
}
