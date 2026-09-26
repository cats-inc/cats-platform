import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { canonical, digest, evidenceIds, fields, integer, physical, safeText, writeNew } from './artifacts.mjs';

const QUOTAS = { createSession: 1, sendMessage: 1, judge: 1, observeSession: 4,
  cancelSession: 2, closeSession: 2, confirmCleanup: 2 };
const METERED = new Set(['sendMessage', 'judge']);

// The Runtime SDK includes optional object properties with undefined values.
// Omit those as JSON transport does, while retaining strict rejection of sparse
// arrays, non-finite numbers, class instances and undefined array entries.
function responseData(value, depth = 0) {
  assert.ok(depth <= 32, 'Effect response nesting exceeds its budget.');
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    assert.equal(Reflect.ownKeys(value).length, value.length + 1);
    for (let index = 0; index < value.length; index++) assert.ok(Object.hasOwn(value, index));
    return value.map(item => responseData(item, depth + 1));
  }
  assert.ok(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, responseData(item, depth + 1)]));
}

/**
 * Parent-owned effects survive evaluator-worker termination. Explicit trusted
 * callbacks provide owned Runtime access, independent grading and process proof.
 * This is not endpoint discovery, authorization, native ownership proof or replay.
 */
export function createCatlasEffectSupervisor({ evaluationRoot, target, runtimeClient, judge, confirmCleanup, reconcile }) {
  for (const callback of [judge, confirmCleanup, reconcile]) assert.equal(typeof callback, 'function');
  const binding = structuredClone(target);
  for (const key of ['provider', 'instance', 'model']) safeText(binding[key], 100);
  const leases = new Map();
  async function open(rawInput) {
    const input = structuredClone(rawInput);
    const { resetId, fixtureRoot } = input;
    integer(input.remainingTokens, 1, 1_000_000);
    assert.match(resetId, /^[a-f0-9-]{36}$/u);
    assert.equal(await physical(fixtureRoot), join(await physical(evaluationRoot), 'resets', resetId));
    assert.ok(!leases.has(resetId), 'This reset already owns an effect channel.');
    const root = join(fixtureRoot, 'effects');
    // Exclusive persistent admission survives process restart; no automatic replay.
    await mkdir(root, { recursive: false, mode: 0o700 });
    const { port1, port2 } = new MessageChannel(), controller = new AbortController();
    const calls = new Map(), counts = new Map(), jobs = new Set();
    let sealed = false, durable = true, sessionId = null, generation = 0;
    let creation = null;
    let catlasCleanup = false, reviewerCleanup = false, reconciliationComplete = false;
    let reconcileNeeded = false, reconciling = false, reconcileSequence = 0, sealPromise;
    function snapshot() {
      const rows = [...calls.values()];
      const knownTokens = rows.reduce((sum, row) => sum + (row.usageTokens ?? 0), 0);
      const pending = rows.filter(row => !row.settled).length;
      const usageComplete = rows.every(row => !row.invoked || !METERED.has(row.method) || row.usageTokens !== null);
      const created = rows.some(row => row.method === 'createSession' && row.settled && row.sessionId);
      const graded = rows.some(row => row.method === 'judge' && row.invoked);
      return { resetId, sealed, durable, sessionId, pending, knownTokens, usageComplete,
        cleanup: durable && pending === 0 && created && ((catlasCleanup && (!graded || reviewerCleanup)) || reconciliationComplete)
          ? 'complete' : 'incomplete',
        effects: rows.map(row => ({ ...row })) };
    }
    function track(promise) {
      const tracked = promise.catch(() => { durable = false; }).finally(() => jobs.delete(tracked));
      jobs.add(tracked); return tracked;
    }
    async function record(name, value) {
      try { await writeNew(join(root, name), value); }
      catch (error) { durable = false; throw error; }
    }
    function validateCleanup(value) {
      fields(value, ['status', 'evidenceRefs']); evidenceIds(value.evidenceRefs);
      assert.ok(['complete', 'incomplete'].includes(value.status));
      return value;
    }
    function scheduleReconciliation() {
      reconcileNeeded = true;
      if (reconciling) return;
      reconciling = true;
      track((async () => {
        while (reconcileNeeded) {
          reconcileNeeded = false;
          const version = generation, sequence = ++reconcileSequence;
          // Reconciliation has its own bounded observer contract, never the
          // already-aborted inference signal. It must not launch new inference.
          let observed;
          try { observed = validateCleanup(await reconcile(snapshot())); }
          catch { observed = { status: 'incomplete', evidenceRefs: ['cleanup:observer-failed'] }; }
          await record(`reconcile-${String(sequence).padStart(4, '0')}.json`,
            { generation: version, observed, currentGeneration: generation });
          reconciliationComplete = version === generation && snapshot().pending === 0 && observed.status === 'complete';
        }
      })().finally(() => {
        reconciling = false;
        if (reconcileNeeded) scheduleReconciliation();
      }));
    }
    function seal(reason = 'worker_closed') {
      if (sealPromise) return sealPromise;
      sealed = true; controller.abort(); port1.close();
      const clean = snapshot().cleanup === 'complete';
      sealPromise = track(record('sealed.json', { resetId, reason, generation }));
      if (!clean) scheduleReconciliation();
      return sealPromise;
    }
    function validateCall(method, args) {
      assert.ok(Object.hasOwn(QUOTAS, method)); assert.ok(Array.isArray(args));
      assert.ok(Buffer.byteLength(canonical(args)) <= 128 * 1024);
      const expectedCount = method === 'sendMessage' ? 3 : 1;
      assert.equal(args.length, expectedCount);
      if (method === 'createSession') {
        const value = args[0];
        fields(value, ['provider', 'instance', 'model', 'modelSelection', 'workspaceKind', 'workspaceAccess',
          'permissionMode', 'sharingMode', 'instructions', 'skills', 'context']);
        assert.equal(value.modelSelection ?? null, null, 'Advanced model selection needs a separate parent binding.');
        if (value.instructions !== undefined) safeText(value.instructions, 10_000);
        validateContext(value.context, true);
        for (const key of ['provider', 'instance', 'model']) assert.equal(value[key], binding[key]);
        assert.equal(value.workspaceKind, 'sandbox'); assert.equal(value.workspaceAccess, 'read_only');
        assert.equal(value.permissionMode, 'default'); assert.equal(value.sharingMode, 'isolated');
        assert.equal(value.cwd, undefined); assert.equal(value.allowedTools, undefined);
        assert.deepEqual(value.skills, { requestedSkills: [], strict: true });
        assert.equal(value.context?.metadata?.knowledgeDigest, input.context.bundle.digest);
        assert.equal(value.context.metadata.observationDigest, digest(JSON.stringify(input.fixture.observation)));
        assert.match(value.context.metadata.requestId, /^[a-f0-9-]{36}$/u);
      } else if (['sendMessage', 'observeSession', 'cancelSession', 'closeSession'].includes(method)) {
        assert.ok(sessionId); assert.equal(args[0], sessionId, 'Foreign Runtime session.');
        if (method === 'sendMessage') {
          const prompt = JSON.parse(args[1]);
          fields(prompt, ['question', 'observation', 'knowledge']);
          assert.equal(prompt.question, input.fixture.question);
          assert.equal(canonical(prompt.observation), canonical(input.fixture.observation));
          fields(args[2], ['instructions', 'context']);
          assert.equal(args[2].instructions ?? null, creation.instructions ?? null, 'Message instructions changed.');
          if (args[2].context !== undefined) validateContext(args[2].context, false);
        }
      } else if (method === 'judge') {
        fields(args[0], ['response', 'responseDigest', 'criteria']);
        assert.equal(args[0].response?.resetId, resetId);
        assert.equal(args[0].responseDigest, digest(args[0].response));
        assert.ok(catlasCleanup, 'Catlas cleanup must precede independent grading.');
        const sent = [...calls.values()].find(row => row.method === 'sendMessage');
        assert.ok(sent?.settled && sent.invoked && sent.usageTokens !== null && sent.usageTokens > 0,
          'Measured Catlas delivery must precede grading.');
      } else {
        assert.equal(args[0].resetId, resetId);
        assert.ok(['catlas', 'reviewer'].includes(args[0].stage));
        if (args[0].stage === 'catlas') assert.equal(args[0].sessionId, sessionId);
      }
    }
    function validateContext(value, creating) {
      fields(value, creating ? ['source', 'reason', 'labels', 'metadata'] : ['metadata']);
      if (value.source !== undefined) assert.equal(value.source, 'interactive');
      if (value.reason !== undefined) assert.equal(value.reason, 'catlas-help');
      if (value.labels !== undefined) assert.deepEqual(value.labels, ['catlas', 'code:new']);
      const supervision = ['supervisionBoundary', 'supervisionProduct', 'supervisionSurface', 'supervisionRunId',
        'supervisionActionId', 'supervisionToolName', 'supervisionReason'];
      fields(value.metadata, creating ? ['requestId', 'knowledgeDigest', 'observationDigest', ...supervision] : supervision);
      for (const text of Object.values(value.metadata)) safeText(text, 300);
      const requestId = creating ? value.metadata.requestId : creation.context.metadata.requestId;
      const expected = { supervisionBoundary: 'cats-supervision-runtime-boundary', supervisionProduct: 'cats-code',
        supervisionSurface: 'code:new', supervisionRunId: requestId,
        supervisionActionId: `${requestId}:${creating ? 'create' : 'send'}`,
        supervisionToolName: creating ? 'cats.runtime.session.create' : 'cats.runtime.message.send',
        supervisionReason: 'Explicit Catlas knowledge assistance' };
      for (const [key, content] of Object.entries(expected)) if (value.metadata[key] !== undefined) assert.equal(value.metadata[key], content);
    }
    async function dispatch(message) {
      let row;
      try {
        fields(message, ['resetId', 'id', 'method', 'args']);
        assert.ok(!sealed, 'Effect admission is sealed.');
        assert.equal(message.resetId, resetId); integer(message.id, 1, 32);
        assert.ok(!calls.has(message.id), 'Duplicate effect ID.');
        validateCall(message.method, message.args);
        const count = counts.get(message.method) ?? 0;
        assert.ok(count < QUOTAS[message.method], 'Effect quota already consumed.');
        if (METERED.has(message.method)) assert.ok(snapshot().usageComplete && snapshot().knownTokens < input.remainingTokens,
          'No further inference is allowed after unknown usage or an exhausted continuation threshold.');
        counts.set(message.method, count + 1);
        row = { id: message.id, method: message.method, invoked: false, settled: false,
          usageTokens: 0, inputDigest: digest(message.args), sessionId: null,
          requestId: message.method === 'createSession' ? message.args[0].context.metadata.requestId : null };
        // Reserve synchronously before any await so concurrent messages cannot
        // duplicate one create/send/judge while its intent is being flushed.
        calls.set(row.id, row); generation++; reconciliationComplete = false;
        if (row.method === 'createSession') creation = structuredClone(message.args[0]);
        const name = String(row.id).padStart(4, '0');
        await record(`effect-${name}-intent.json`, { ...row, target: binding });
        controller.signal.throwIfAborted();
        row.invoked = true;
        if (METERED.has(row.method)) row.usageTokens = null;
        if (row.method === 'sendMessage') catlasCleanup = false;
        if (row.method === 'judge') reviewerCleanup = false;
        let value;
        if (row.method === 'judge') value = await judge({ ...message.args[0], signal: controller.signal });
        else if (row.method === 'confirmCleanup') value = await confirmCleanup(message.args[0]);
        else value = await runtimeClient[row.method](...message.args);
        if (row.method === 'createSession') {
          safeText(value.id, 160); sessionId = value.id; row.sessionId = sessionId;
        }
        if (METERED.has(row.method)) {
          const measured = row.method === 'sendMessage' ? value?.tokensUsed : value?.usageTokens;
          row.usageTokens = Number.isSafeInteger(measured) && (row.method === 'sendMessage' ? measured > 0 : measured >= 0)
            ? measured : null;
        }
        if (row.method === 'confirmCleanup') {
          validateCleanup(value);
          if (message.args[0].stage === 'catlas') catlasCleanup = value.status === 'complete';
          else reviewerCleanup = value.status === 'complete';
        }
        const normalized = responseData(value === undefined ? null : value);
        assert.ok(Buffer.byteLength(canonical(normalized)) <= 256 * 1024, 'Effect response exceeds its budget.');
        await record(`effect-${name}-result.json`, { ...row, settled: true, outcome: 'returned', responseDigest: digest(normalized) });
        if (!sealed) port1.postMessage({ id: message.id, ok: true, value: normalized });
      } catch {
        if (row) {
          await record(`effect-${String(row.id).padStart(4, '0')}-failure.json`, { ...row, settled: true, outcome: 'failed' })
            .catch(() => { durable = false; });
        }
        if (!sealed) port1.postMessage({ id: message?.id, ok: false });
      } finally {
        if (row) { row.settled = true; generation++; reconciliationComplete = false; }
        if (sealed && row) scheduleReconciliation();
      }
    }
    port1.on('message', message => { track(dispatch(message)); });
    port1.on('close', () => { void seal(); });
    const lease = { port: port2, seal, snapshot, async drain(timeoutMs = 1_000) {
      integer(timeoutMs, 1, 30_000);
      let timer;
      try {
        await Promise.race([(async () => { while (jobs.size) await Promise.all([...jobs]); })(),
          new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
      } finally { clearTimeout(timer); }
      return { ...snapshot(), reconciliationPending: reconciling };
    } };
    leases.set(resetId, lease); return lease;
  }
  return { open, inspect: resetId => leases.get(resetId)?.snapshot() ?? null,
    async drain(timeoutMs = 1_000) { return Promise.all([...leases.values()].map(lease => lease.drain(timeoutMs))); } };
}
