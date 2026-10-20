import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodeWorkAreasService } from '../src/products/code/state/workAreas.ts';
import type { CodeConversationWorkAreas } from '../src/products/code/shared/workAreas.ts';
import { workAreaContext, runtimeSnapshot, runtimeInspection } from './fixtures/workAreas.ts';
import { readCodeWorkAreas } from '../src/products/code/shared/readWorkAreas.ts';

const operations = (value: CodeConversationWorkAreas) => value.participants.flatMap(p => p.repositories
  .flatMap(repo => repo.checkouts.flatMap(checkout => checkout.operations)));
const waitFor = async (check: () => boolean) => {
  const deadline = Date.now() + 3000;
  while (!check()) { if (Date.now() > deadline) throw new Error('Condition not reached'); await new Promise(resolve => setTimeout(resolve, 5)); }
};

test('merging a bound checkout with historical observed activity preserves its association', async () => {
  const context = workAreaContext();
  const historical = structuredClone(context.participants[0].attempts[0]);
  historical.sessionId = 'session-old'; historical.current = false; historical.activeBindings = [];
  historical.bindings = [{ ...historical.bindings[0], sessionId: historical.sessionId, turnId: 'turn-old' }];
  context.participants[0].attempts.push(historical);
  const current = runtimeInspection(context);
  for (const checkout of current.session.inspection.workspaceActivity.workspaces) {
    checkout.association = 'session_binding'; checkout.runningOperations = []; checkout.recentOperations = [];
  }
  const old = runtimeInspection(context, runtimeSnapshot('session-old'), historical.bindings[0]);
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async id => id === 'session-a' ? current : old, streamSession: async () => {},
  } });
  const value = (await service.read(context.conversationId))!;
  assert.equal(value.participants[0].repositories[0].checkouts[0].association, 'observed_operation');
  assert.ok(readCodeWorkAreas(value, context.conversationId));
});

test('a stalled output cannot hold a revoked owner or lease subscription open', async () => {
  for (const revoke of ['owner', 'lease']) {
    const context = workAreaContext();
    let aborted = false; let delivering = false; let release!: () => void;
    const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, reconcileMs: 20,
      runtime: { observeSession: async () => runtimeInspection(context),
        streamSession: async (_id, _event, options) => new Promise<void>(resolve => {
          options!.signal!.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true });
        }),
      } });
    const abort = new AbortController();
    const watching = service.watch(context.conversationId, async () => {
      delivering = true; await new Promise<void>(resolve => { release = resolve; });
    }, abort.signal);
    await waitFor(() => delivering);
    if (revoke === 'owner') context.owned = false;
    else context.participants[0].attempts[0].attached = false;
    await waitFor(() => aborted);
    abort.abort(); await watching; release();
  }
});

test('independent participant sessions keep their own operations and historical attempts inactive', async () => {
  const context = workAreaContext();
  const other = structuredClone(context.participants[0]);
  other.participantId = 'participant-b'; other.canonicalParticipantId = 'canonical-b'; other.coordinator = false;
  const attempt = other.attempts[0]; attempt.sessionId = 'session-b'; attempt.current = false;
  for (const binding of [...attempt.bindings, ...attempt.activeBindings]) binding.sessionId = 'session-b';
  context.participants.push(other);
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async id => runtimeInspection(context, runtimeSnapshot(id, `runtime-${id}`, true),
      context.participants.find(p => p.attempts[0].sessionId === id)!.attempts[0].bindings[0]),
    streamSession: async () => {},
  } });
  const value = (await service.read(context.conversationId))!;
  assert.equal(value.participants.length, 2);
  assert.ok(value.participants[0].repositories.flatMap(r => r.checkouts.flatMap(c => c.operations)).some(o => o.active));
  assert.ok(value.participants[1].repositories.flatMap(r => r.checkouts.flatMap(c => c.operations))
    .every(o => o.sessionId === 'session-b' && !o.active));
  assert.equal(value.participants[1].executions[0].continuity, 'last_known');
});

test('stream EOF is retried with reinspection after a bounded delay', async () => {
  const context = workAreaContext();
  let streams = 0; let inspections = 0;
  const abort = new AbortController();
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, reconcileMs: 25,
    runtime: { observeSession: async () => { inspections++; return runtimeInspection(context); },
      streamSession: async (_id, _event, options) => {
        streams++; if (streams === 1) return;
        await new Promise<void>(resolve => options!.signal!.addEventListener('abort', () => resolve(), { once: true }));
      },
    } });
  const watching = service.watch(context.conversationId, async () => {}, abort.signal);
  await waitFor(() => streams === 2);
  assert.ok(inspections >= 2); assert.equal(streams, 2);
  abort.abort(); await watching;
});

test('Code groups verified repo/worktree facts under the participant and its own coordinator session', async () => {
  const context = workAreaContext();
  const snapshot = runtimeSnapshot('session-a', 'runtime-run-a', true);
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async () => runtimeInspection(context, snapshot), streamSession: async () => {},
  } });
  const payload = (await service.read(context.conversationId))!;
  assert.equal(payload.participants.length, 1);
  assert.equal(payload.participants[0].coordinator, true);
  assert.equal(payload.participants[0].executions.length, 1);
  assert.equal(payload.participants[0].repositories.length, 1);
  assert.equal(payload.participants[0].repositories[0].checkouts.length, 2);
  assert.equal(operations(payload).filter(op => op.active).length, 1);
  assert.ok(operations(payload).every(op => op.turnId === 'turn-a' && op.laneId === 'lane-a'));
  assert.equal(payload.codespace.path, context.rootPath);
  assert.notEqual(payload.participants[0].executions[0].runtimeCwd, context.rootPath,
    'selected root and actual cwd remain separate facts');
});

test('same-session lane replacement and history cleanup cannot reactivate old operations', async () => {
  const context = workAreaContext();
  const snapshot = runtimeSnapshot('session-a', 'runtime-run-a', true);
  const oldBinding = structuredClone(context.participants[0].attempts[0].bindings[0]);
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, runtime: {
    observeSession: async () => runtimeInspection(context, snapshot, oldBinding), streamSession: async () => {},
  } });
  assert.equal(operations((await service.read(context.conversationId))!).some(op => op.active), true);
  const attempt = context.participants[0].attempts[0];
  const replacement = { ...oldBinding, turnId: 'turn-b', laneId: 'lane-b', runId: 'product-run-b', targetStateId: 'target-b' };
  attempt.bindings.push(replacement); attempt.activeBindings = [replacement];
  const stale = (await service.read(context.conversationId))!;
  assert.ok(operations(stale).every(op => !op.active));
  assert.equal(operations(stale).find(op => op.state === 'running')?.displayState, 'unknown');
  attempt.bindings = [replacement]; // Engine excludes a logsCleared/deleted run or mission.
  const cleared = (await service.read(context.conversationId))!;
  assert.equal(cleared.participants[0].repositories.length, 0);
  assert.equal(cleared.participants[0].executions[0].coverage.reason, 'execution_attribution_unverified');
});

test('an old inspection cannot restore a removed participant or replaced session after await', async () => {
  const context = workAreaContext();
  let finish!: (value: ReturnType<typeof runtimeInspection>) => void;
  let started = false;
  const response = runtimeInspection(context);
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, runtime: {
    observeSession: () => { started = true; return new Promise(resolve => { finish = resolve; }); }, streamSession: async () => {},
  } });
  const reading = service.read(context.conversationId);
  await waitFor(() => started);
  context.participants = [];
  finish(response);
  assert.deepEqual((await reading)!.participants, []);
});

test('mutable session context cannot supply mapping and foreign snapshot envelopes are rejected', async () => {
  const context = workAreaContext();
  const response = runtimeInspection(context);
  const metadata = structuredClone(response.session.inspection.currentRun.wake.metadata);
  response.session.inspection.currentRun.wake.metadata.targetId = 'other-participant';
  Object.assign(response.session, { context: { metadata } });
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async () => response, streamSession: async () => {},
  } });
  assert.equal((await service.read(context.conversationId))!.participants[0].repositories.length, 0);
  response.session.id = 'foreign-session';
  const value = (await service.read(context.conversationId))!;
  assert.ok(operations(value).every(op => !op.active));
});

test('missing/restarted Runtime drops observations; connection interruption retains inactive last-known facts', async () => {
  const context = workAreaContext();
  let mode = 'ok';
  const service = createCodeWorkAreasService({ inspector: { read: async () => context }, runtime: {
    observeSession: async () => { if (mode === 'error') throw new Error('offline');
      return mode === 'missing' ? { session: { id: 'session-a', inspection: {} } } : runtimeInspection(context, runtimeSnapshot('session-a', 'runtime-run-a', true)); },
    streamSession: async () => {},
  } });
  await service.read(context.conversationId);
  mode = 'error';
  const interrupted = (await service.read(context.conversationId))!;
  assert.equal(interrupted.participants[0].executions[0].continuity, 'interrupted');
  assert.ok(operations(interrupted).every(op => !op.active));
  mode = 'missing';
  assert.equal((await service.read(context.conversationId))!.participants[0].repositories.length, 0);
});

test('watch starts stream before inspection, reconciles epoch/revisions and aborts on idle ownership change', async () => {
  const context = workAreaContext();
  const snapshot = runtimeSnapshot('session-a', 'runtime-run-a', true);
  const order: string[] = [];
  const outputs: CodeConversationWorkAreas[] = [];
  let event!: (value: { event: string; data: Record<string, unknown> }) => Promise<void> | void;
  let sourceAborted = false;
  const abort = new AbortController();
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, reconcileMs: 20,
    runtime: { observeSession: async () => { order.push('inspect'); return runtimeInspection(context, structuredClone(snapshot)); },
      streamSession: async (_id, callback, options) => { order.push('stream'); event = callback;
        await new Promise<void>(resolve => options!.signal!.addEventListener('abort', () => { sourceAborted = true; resolve(); }, { once: true })); },
    } });
  const watching = service.watch(context.conversationId, async value => { if (value) outputs.push(value); }, abort.signal);
  await waitFor(() => outputs.length > 0);
  assert.equal(order[0], 'stream');
  snapshot.observationEpoch = 'new-epoch'; snapshot.revision = 1;
  await event({ event: 'workspace_activity', data: { workspaceActivity: structuredClone(snapshot) } });
  await waitFor(() => outputs.some(value => value.participants[0].executions[0].observationEpoch === 'new-epoch'));
  snapshot.revision = 10;
  await event({ event: 'workspace_activity', data: { workspaceActivity: structuredClone(snapshot) } });
  await waitFor(() => outputs.at(-1)!.participants[0].executions[0].revision === 10);
  await event({ event: 'workspace_activity', data: { workspaceActivity: { ...snapshot, revision: 2 } } });
  context.owned = false;
  await waitFor(() => sourceAborted);
  abort.abort(); await watching;
  assert.equal(await service.read(context.conversationId), null);
});

test('inspection concurrency remains bounded even if requests ignore timeout', async () => {
  const context = workAreaContext();
  let pending = 0; let maximum = 0;
  const releases: Array<() => void> = [];
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, inspectTimeoutMs: 15,
    runtime: { observeSession: () => { pending++; maximum = Math.max(maximum, pending);
      return new Promise(resolve => releases.push(() => { pending--; resolve(runtimeInspection(context)); })); }, streamSession: async () => {},
    } });
  await Promise.all(Array.from({ length: 20 }, () => service.read(context.conversationId)));
  assert.equal(maximum, 4);
  assert.equal(pending, 4);
  for (const release of releases) release();
});

test('an old inspection cannot confirm a late old epoch after a newer epoch was observed', async () => {
  const context = workAreaContext();
  const old = runtimeSnapshot('session-a', 'runtime-run-a', true); old.observationEpoch = 'old';
  const next = { ...structuredClone(old), observationEpoch: 'new' };
  let release!: () => void;
  let event!: (value: { event: string; data: Record<string, unknown> }) => void | Promise<void>;
  let reads = 0;
  const values: CodeConversationWorkAreas[] = [];
  const abort = new AbortController();
  const service = createCodeWorkAreasService({ inspector: { read: async () => structuredClone(context) }, reconcileMs: 1000,
    runtime: { observeSession: async () => { reads++;
      if (reads === 1) { await new Promise<void>(resolve => { release = resolve; }); return runtimeInspection(context, old); }
      return runtimeInspection(context, next); },
      streamSession: async (_id, callback, options) => { event = callback;
        await new Promise<void>(resolve => options!.signal!.addEventListener('abort', () => resolve(), { once: true })); },
    } });
  const watching = service.watch(context.conversationId, async value => { if (value) values.push(value); }, abort.signal);
  await waitFor(() => reads === 1 && Boolean(event));
  await event({ event: 'workspace_activity', data: { workspaceActivity: next } });
  await event({ event: 'workspace_activity', data: { workspaceActivity: old } });
  release();
  await waitFor(() => values.some(value => value.participants[0].executions[0].observationEpoch === 'new'));
  assert.equal(values.some(value => value.participants[0].executions[0].observationEpoch === 'old'
    && operations(value).some(operation => operation.active)), false);
  abort.abort(); await watching;
});
