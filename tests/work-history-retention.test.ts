import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createDefaultCoreState, upsertCoreRun, upsertCoreArtifact, upsertCoreCheckpoint, appendCoreTrace } from '../src/core/model/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { emptyOwnerLifecycle, normalizeOwnerLifecycle, OwnerLifecycleFormatError } from '../src/core/ownerLifecycle.ts';
import { applyHistoryRetention, historyRetentionView, tickHistoryRetention, updateHistoryRetention } from '../src/products/work/state/historyRetention.ts';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';
import { routeHistoryRetention } from '../src/products/work/api/historyRetentionRoutes.ts';

const now = new Date('2026-10-20T00:00:00.000Z'), old = '2026-01-01T00:00:00.000Z';
function fixture() {
  let core = upsertCoreRun(createDefaultCoreState(), { id: 'old', title: 'Old attempt', status: 'completed', summary: 'Outcome kept', completedAt: old }).core;
  return appendCoreTrace(core, { id: 'trace', traceId: 'trace', runId: 'old', kind: 'dispatch', message: 'private-detail' }).core;
}
function enabled(core = fixture()) { return updateHistoryRetention(core, { enabled: true, days: 30, revision: core.ownerLifecycle?.revision ?? 0 }); }

test('retention is opt-in, validates policy and compares revisions; absent old-profile policy is lossless', async () => {
  const core = fixture(), store = new MemoryCoreStore(core);
  await tickHistoryRetention(store, now);
  assert.deepEqual(await store.readCore(), core); assert.equal(historyRetentionView(core, now).policy.enabled, false);
  assert.throws(() => updateHistoryRetention(core, { enabled: true, days: 0, revision: 0 }), /age/);
  assert.throws(() => updateHistoryRetention(enabled(), { enabled: false, days: 30, revision: 0 }), /changed/);
  for (const lastResult of [{ inspected: -1, compacted: 0, protected: 0 }, { inspected: 101, compacted: 0, protected: 0 }]) {
    assert.throws(() => normalizeOwnerLifecycle({ ...emptyOwnerLifecycle(), retention: { ...emptyOwnerLifecycle().retention, lastResult } }), OwnerLifecycleFormatError);
  }
});

test('automatic compaction preserves summaries, outputs and referenced/active/gated/new descendants', () => {
  let core = fixture();
  for (const id of ['output', 'active', 'gate', 'parent', 'new-child']) core = upsertCoreRun(core, { id, title: id, status: id === 'active' ? 'running' : 'completed', parentRunId: id === 'new-child' ? 'parent' : null, completedAt: id === 'new-child' ? now.toISOString() : old }).core;
  core = upsertCoreArtifact(core, { id: 'file', title: 'Deliverable', kind: 'document', runId: 'output', path: 'C:/keep/output.txt' }).core;
  core = upsertCoreCheckpoint(core, { id: 'open', label: 'Required', runId: 'gate', status: 'open' }).core;
  const next = applyHistoryRetention(enabled(core), now);
  assert.equal(next.runs.length, 6); assert.equal(next.runs.find(run => run.id === 'old')!.summary, 'Outcome kept');
  assert.equal(next.traces[0].message, 'Execution detail cleared.'); assert.deepEqual(next.artifacts, core.artifacts);
  assert.equal(next.ownerLifecycle?.entries['run:output'], undefined); assert.equal(next.ownerLifecycle?.entries['run:active'], undefined);
  assert.equal(next.ownerLifecycle?.entries['run:gate'], undefined); assert.equal(next.ownerLifecycle?.entries['run:parent'], undefined);
  assert.deepEqual(next.ownerLifecycle?.retention.lastResult, { inspected: 4, compacted: 1, protected: 3 });
  assert.deepEqual(applyHistoryRetention(next, now), next); // No repeat write within the hourly boundary.
});

test('bounded passes make progress past protected old records and preserve newly admitted work', async () => {
  let core = createDefaultCoreState();
  for (let i = 0; i < 110; i++) {
    const id = `a${String(i).padStart(3, '0')}`;
    core = upsertCoreRun(core, { id, title: id, status: 'completed', completedAt: old }).core;
    core = upsertCoreArtifact(core, { id: `file${i}`, title: id, kind: 'document', runId: id }).core;
  }
  core = upsertCoreRun(core, { id: 'z-eligible', title: 'Eligible', status: 'failed', completedAt: old }).core;
  const first = applyHistoryRetention(enabled(core), now);
  assert.deepEqual(first.ownerLifecycle?.retention.lastResult, { inspected: 100, compacted: 0, protected: 100 });
  const next = applyHistoryRetention(first, new Date(now.getTime() + 3_600_000));
  assert.equal(next.ownerLifecycle?.retention.lastResult?.compacted, 1);
  const store = new MemoryCoreStore(enabled(fixture()));
  await Promise.all([
    store.updateCore(current => upsertCoreRun(current, { id: 'child', title: 'New work', status: 'running', parentRunId: 'old' }).core),
    tickHistoryRetention(store, now),
  ]);
  assert.equal((await store.readCore()).ownerLifecycle?.entries['run:old'], undefined);
  assert.equal((await store.readCore()).runs.find(run => run.id === 'child')?.status, 'running');
  await store.updateCore(current => updateHistoryRetention(current, { enabled: false, days: 30, revision: current.ownerLifecycle?.revision }));
  const disabled = await store.readCore(); await tickHistoryRetention(store, new Date(now.getTime() + 7_200_000)); assert.deepEqual(await store.readCore(), disabled);
});

test('retention persists atomically; failed backup preserves detail, retry and recovery cannot resurrect it or re-enable policy', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-retention-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify(buildPersistedChatSnapshot(createDefaultChatState(), enabled())));
  const bytes = await readFile(file, 'utf8'); await mkdir(`${file}.bak`);
  const store = new FileChatStore(file);
  await assert.rejects(tickHistoryRetention(store, now)); assert.equal(await readFile(file, 'utf8'), bytes);
  assert.ok((await store.readCore()).traces.some(trace => trace.message === 'private-detail'));
  await rm(`${file}.bak`, { recursive: true }); await tickHistoryRetention(store, now);
  for (const filename of [file, `${file}.bak`]) assert.ok(!(await readFile(filename, 'utf8')).includes('private-detail'));
  const restarted = new FileChatStore(file); await restarted.write(await restarted.read());
  assert.equal((await restarted.readCore()).ownerLifecycle?.retention.enabled, true);
  await writeFile(file, '{broken'); const recovered = await new FileChatStore(file).readCore();
  assert.equal(recovered.ownerLifecycle?.retention.enabled, false); assert.match(recovered.ownerLifecycle!.retention.lastError!, /recovery/);
  assert.ok(!JSON.stringify(recovered).includes('private-detail')); assert.equal(recovered.runs[0].summary, 'Outcome kept');
});

test('retention HTTP saves only explicit checked policies and serializes conflicting updates', async t => {
  const store = new MemoryCoreStore(fixture());
  const server = createServer(async (request, response) => {
    await routeHistoryRetention({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store, now: () => now } });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/work/history/retention`;
  const view = await (await fetch(url)).json(); assert.equal(view.policy.enabled, false); assert.equal((await store.readCore()).ownerLifecycle, undefined);
  const patch = (body: unknown) => fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await patch({ enabled: true, days: 10000, revision: 0 })).status, 400);
  const responses = await Promise.all([patch({ enabled: true, days: 7, revision: 0 }), patch({ enabled: true, days: 14, revision: 0 })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await store.readCore()).traces[0].message, 'private-detail'); // Saving is not an immediate destructive operation.
});
