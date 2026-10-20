import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, mkdir, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createDefaultCoreState, upsertCoreRun, upsertCoreTask, upsertCoreArtifact, upsertCoreCheckpoint, appendCoreTrace } from '../src/core/model/index.ts';
import { applyHistory, executionSource, previewHistory } from '../src/products/work/state/historyManagement.ts';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { createChannel, appendMessage } from '../src/products/chat/state/model/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';
import { syncCoreStateWithChatState } from '../src/products/chat/state/core-projection/index.ts';
import type { RoomWorkflowTurn } from '../src/shared/roomRouting.ts';
import { listExecutionHistory } from '../src/products/work/state/historyListing.ts';
import { routeWorkHistoryApi } from '../src/products/work/api/historyRoutes.ts';
import { MemoryCoreStore } from '../src/core/store.ts';

function coreFixture() {
  let core = upsertCoreTask(createDefaultCoreState(), { id: 't', title: 'Work' }).core;
  core = upsertCoreRun(core, { id: 'r', title: 'Attempt', taskId: 't', status: 'completed', summary: 'Completed', metadata: { source: 'work-supervised-run' } }).core;
  core = appendCoreTrace(core, { id: 'trace', traceId: 'trace', message: 'trace-only-secret', kind: 'dispatch', runId: 'r' }).core;
  return core;
}

test('preview binds scope, descendants and current dependencies; retry is idempotent', () => {
  let core = coreFixture();
  core = upsertCoreRun(core, { id: 'child', title: 'Child', parentRunId: 'r', status: 'completed' }).core;
  const preview = previewHistory(core, { subjects: [{ family: 'run', id: 'r' }], scope: 'history' });
  assert.equal(preview.subjects.length, 2);
  const changed = upsertCoreArtifact(core, { id: 'a', title: 'Output', kind: 'report', runId: 'r' }).core;
  assert.throws(() => applyHistory(changed, preview), /changed/);
  assert.throws(() => applyHistory(core, { ...preview, scope: 'logs' }), /changed/);
  const applied = applyHistory(core, preview);
  assert.equal(applied.core.runs.length, 0);
  assert.equal(applied.core.traces.length, 0);
  assert.deepEqual(applyHistory(applied.core, preview).receipt, applied.receipt);
  assert.equal(applied.core.tasks.length, 1);
});

test('active descendants and open gates block cleanup; protected output retains summaries', () => {
  const gated = upsertCoreCheckpoint(coreFixture(), { id: 'gate', label: 'Approval evidence', status: 'open', runId: 'r' }).core;
  assert.equal(previewHistory(gated, { subjects: [{ family: 'run', id: 'r' }], scope: 'logs' }).items[0].outcome, 'blocked');
  let core = coreFixture();
  core = upsertCoreRun(core, { id: 'active', title: 'Active child', parentRunId: 'r', status: 'running' }).core;
  let preview = previewHistory(core, { subjects: [{ family: 'run', id: 'r' }], scope: 'history' });
  assert.ok(preview.items.every(item => item.outcome === 'blocked'));
  assert.equal(applyHistory(core, preview).core.traces[0].message, 'trace-only-secret');
  core = upsertCoreArtifact(coreFixture(), { id: 'a', title: 'Required report', kind: 'report', runId: 'r', path: 'keep.md' }).core;
  preview = previewHistory(core, { subjects: [{ family: 'run', id: 'r' }], scope: 'history' });
  assert.equal(preview.items[0].outcome, 'retained');
  const next = applyHistory(core, preview).core;
  assert.equal(next.runs[0].summary, 'Completed');
  assert.equal(next.artifacts[0].path, 'keep.md');
  assert.equal(next.traces[0].message, 'Execution detail cleared.');
  assert.equal(executionSource(core.runs[0]), 'work');
});

test('history filters preserve all-source access, stable pagination and ordinary-room distinction', () => {
  let core = coreFixture();
  core = upsertCoreRun(core, { id: 'room', title: 'Ordinary conversation', status: 'completed', metadata: { source: 'chat-room-workflow' } }).core;
  core = upsertCoreRun(core, { id: 'unknown', title: 'Needs diagnosis', status: 'failed' }).core;
  assert.deepEqual(new Set(listExecutionHistory(core, new URLSearchParams()).items.map(item => item.id)), new Set(['r', 'unknown']));
  const all = listExecutionHistory(core, new URLSearchParams('source=all&pageSize=1'));
  assert.equal(all.total, 3); assert.equal(all.items.length, 1);
  const page2 = listExecutionHistory(core, new URLSearchParams('source=all&pageSize=1&page=2'));
  assert.notEqual(page2.items[0].id, all.items[0].id);
  assert.equal(listExecutionHistory(core, new URLSearchParams('source=room')).items[0].id, 'room');
  assert.throws(() => listExecutionHistory(core, new URLSearchParams('from=invalid')), /date range/);
  assert.equal(core.runs.length, 3);
});

test('history HTTP operations bind preview, revalidate references and serialize duplicate apply', async t => {
  const store = new MemoryCoreStore(coreFixture());
  const server = createServer(async (request, response) => {
    if (!await routeWorkHistoryApi({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store } })) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/work/history`;
  const post = (operation: string, body: unknown) => fetch(`${base}/${operation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const selection = { subjects: [{ family: 'run', id: 'r' }], scope: 'history' };
  assert.equal((await post('listing', { ...selection, action: 'archive', revision: 0 })).status, 200);
  assert.equal((await (await fetch(base)).json()).items.length, 0);
  assert.equal((await (await fetch(`${base}?view=archived`)).json()).items.length, 1);
  assert.equal((await post('listing', { ...selection, action: 'restore', revision: 0 })).status, 409);
  assert.equal((await post('listing', { ...selection, action: 'restore', revision: 1 })).status, 200);
  assert.equal((await post('apply', selection)).status, 400);
  const preview = await (await post('preview', selection)).json();
  const responses = await Promise.all([post('apply', preview), post('apply', preview)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await store.readCore()).ownerLifecycle!.receipts.length, 1);
  assert.equal((await store.readCore()).runs.length, 0);
});

test('failed cleanup backup keeps the original history and releases the mutation lock', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-history-failure-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify(buildPersistedChatSnapshot(createDefaultChatState(), coreFixture())));
  const store = new FileChatStore(file);
  const preview = previewHistory(await store.readCore(), { subjects: [{ family: 'run', id: 'r' }], scope: 'history' });
  const before = await readFile(file, 'utf8'); await mkdir(`${file}.bak`);
  await assert.rejects(store.updateCore(core => applyHistory(core, preview).core));
  assert.equal(await readFile(file, 'utf8'), before);
  assert.deepEqual((await readdir(dir)).sort(), ['state.json', 'state.json.bak']);
  assert.equal((await store.readCore()).runs.length, 1);
});

test('workflow cleanup compacts source duplicates and backups without changing transcript or restoring logs on recovery', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const now = '2026-10-20T00:00:00.000Z';
  let chat = createChannel(createDefaultChatState(), { title: 'Room', topic: '', originSurface: 'chat', skipBossCatGreeting: true }, new Date(now));
  const channelId = chat.selectedChannelId;
  chat = appendMessage(chat, channelId, { body: 'Keep my transcript', senderKind: 'user', senderName: 'Owner' }, new Date(now)).state;
  const channel = chat.channels.find(channel => channel.id === channelId)!;
  const event = { id: 'event-detail', turnId: 'turn', kind: 'target_completed' as const, status: 'completed' as const, message: 'trace-only-secret', actor: null,
    sourceMessageId: null, targets: [], dispatchId: null, checkpointId: null, outcomeId: null, createdAt: now, metadata: { stdout: 'trace-only-secret' } };
  const turn: RoomWorkflowTurn = { id: 'turn', status: 'completed', sourceMessageId: channel.messages[0].id, sourceSenderKind: 'user', sourceSenderName: 'Owner',
    guard: null, stageId: 'done', workflowShape: 'sequential', reviewRequired: false, lastCheckpointId: null, convergeTargetId: null, continuationCount: 0, dispatchCount: 0,
    targetStatuses: [{ id: 'target', dispatchId: 'dispatch', participant: { participantKind: 'orchestrator', participantId: 'orchestrator', participantName: 'Coordinator' }, laneId: null, sessionId: null,
      source: null, sourceMessageId: channel.messages[0].id, trigger: 'explicit_mention', mentionNames: [], depth: 0, parentCheckpointId: null, branchStrategy: null, handoffReason: null,
      wakeRequestId: null, status: 'completed', queuedAt: now, startedAt: now, completedAt: now, response: { assistantTurnId: 'assistant-result', messageIds: ['message-result'], fullText: 'trace-only-secret', segmentCount: 1 }, error: null }],
    events: [event, { ...event, id: 'event-result', kind: 'outcome', message: 'Completed', metadata: {} }], startedAt: now, updatedAt: now, completedAt: now };
  channel.roomRouting!.workflow = { activeTurn: null, turnHistory: [turn], eventHistory: turn.events, lastCheckpointEvent: null, lastOutcomeEvent: turn.events[1] };
  await writeFile(file, JSON.stringify(buildPersistedChatSnapshot(chat, syncCoreStateWithChatState(chat))));
  const store = new FileChatStore(file);
  const run = (await store.readCore()).runs[0];
  const preview = previewHistory(await store.readCore(), { subjects: [{ family: 'run', id: run.id }], scope: 'logs' });
  await store.updateCore(core => applyHistory(core, preview).core);
  assert.equal((await store.readCore()).runs[0].summary, 'Completed');
  assert.ok((await store.read()).channels.find(channel => channel.id === channelId)!.messages.some(message => message.body === 'Keep my transcript'));
  assert.ok(!(await readFile(file, 'utf8')).includes('trace-only-secret'));
  assert.ok(!(await readFile(`${file}.bak`, 'utf8')).includes('trace-only-secret'));
  await store.write(await store.read());
  await writeFile(file, '{corrupt');
  const recovered = new FileChatStore(file);
  assert.ok(!JSON.stringify(await recovered.readCore()).includes('trace-only-secret'));
  assert.equal((await recovered.readCore()).runs[0].summary, 'Completed');
  const removePreview = previewHistory(await recovered.readCore(), { subjects: [{ family: 'run', id: run.id }], scope: 'history' });
  assert.equal(removePreview.items[0].outcome, 'removed');
  await recovered.updateCore(core => applyHistory(core, removePreview).core);
  await recovered.write(await recovered.read());
  assert.equal((await new FileChatStore(file).readCore()).runs.length, 0);
  await writeFile(file, '{corrupt');
  assert.equal((await new FileChatStore(file).readCore()).runs.length, 0);
});
