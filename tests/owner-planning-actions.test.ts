import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { routeCoreApi } from '../src/core/api/index.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { createDefaultCoreState, upsertCoreProject, upsertCoreTask, upsertCoreWorkItem, upsertCoreRun, upsertCoreArtifact } from '../src/core/model/index.ts';
import { applyOwnerAction, ownerActionView } from '../src/core/ownerActions.ts';
import { FileChatStore, MemoryChatStore } from '../src/products/chat/state/store.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';

test('owner planning commands preserve external bindings, enforce acceptance and reject stale/cyclic edits', async () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreTask(core, { id: 't', title: 'Task', metadata: { workRenderer: { acceptanceCriteria: 'Tests pass' }, externalIssue: { id: 'issue-1', status: 'open' } } }).core;
  let view = ownerActionView(core, 'task', 't');
  assert.throws(() => applyOwnerAction(core, 'task', 't', { action: 'complete', token: view.token }), /acceptance/);
  core = applyOwnerAction(core, 'task', 't', { action: 'complete', token: view.token, acceptanceConfirmed: true, acceptanceNote: 'Targeted tests passed' });
  assert.equal(core.tasks[0].status, 'completed');
  assert.deepEqual(core.tasks[0].metadata.externalIssue, { id: 'issue-1', status: 'open' });
  assert.throws(() => applyOwnerAction(core, 'task', 't', { action: 'reopen', token: view.token }), /changed/);
  view = ownerActionView(core, 'task', 't');
  core = applyOwnerAction(core, 'task', 't', { action: 'reopen', token: view.token });
  core = upsertCoreTask(core, { id: 'child', title: 'Child', parentTaskId: 't' }).core;
  view = ownerActionView(core, 'task', 't');
  assert.throws(() => applyOwnerAction(core, 'task', 't', { action: 'edit', token: view.token, title: 'Renamed', summary: '', assignedActorIds: [], parentId: 'child' }), /cycle/);
  core = applyOwnerAction(core, 'task', 't', { action: 'edit', token: view.token, title: 'Renamed', summary: 'Updated', assignedActorIds: [], parentId: null, priority: 'high' });
  const store = new MemoryChatStore(buildPersistedChatSnapshot(createDefaultChatState(), core));
  assert.equal((await store.readCore()).tasks.find(task => task.id === 't')?.title, 'Renamed');
  assert.equal((await store.readCore()).tasks.find(task => task.id === 't')?.metadata.workRenderer && ((await store.readCore()).tasks[0].metadata.workRenderer as any).priority, 'high');
});

test('active execution, source ownership and published/referenced evidence remain protected', () => {
  let core = upsertCoreTask(createDefaultCoreState(), { id: 't', title: 'Task', status: 'approved' }).core;
  core = upsertCoreRun(core, { id: 'r', title: 'Active', taskId: 't', status: 'running' }).core;
  const view = ownerActionView(core, 'task', 't');
  for (const action of ['edit', 'complete', 'cancel', 'archive', 'delete']) assert.throws(() => applyOwnerAction(core, 'task', 't', { action, token: view.token }), /active|Active|Finish/);
  core = upsertCoreWorkItem(core, { id: 'derived', title: 'Derived', metadata: { source: 'chat-channel' } }).core;
  const derived = ownerActionView(core, 'work_item', 'derived');
  assert.throws(() => applyOwnerAction(core, 'work_item', 'derived', { action: 'complete', token: derived.token }), /source/);
  core = applyOwnerAction(core, 'work_item', 'derived', { action: 'archive', token: derived.token });
  core = upsertCoreArtifact(core, { id: 'a', title: 'Deliverable', kind: 'file', status: 'published' }).core;
  const artifact = ownerActionView(core, 'artifact', 'a');
  assert.throws(() => applyOwnerAction(core, 'artifact', 'a', { action: 'delete', token: artifact.token }), /Published/);
  core = applyOwnerAction(core, 'artifact', 'a', { action: 'edit', token: artifact.token, title: 'Reviewed deliverable', summary: '' });
  assert.equal(core.artifacts[0].title, 'Reviewed deliverable');
});

test('moving a Work Item checks its hierarchy and never mutates its external issue', () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreProject(core, { id: 'p2', title: 'Next' }).core;
  core = upsertCoreWorkItem(core, { id: 'w', title: 'Work', projectId: 'p', metadata: { externalBindings: [{ externalId: '42' }] } }).core;
  core = upsertCoreWorkItem(core, { id: 'child', title: 'Child', projectId: 'p', parentWorkItemId: 'w' }).core;
  let view = ownerActionView(core, 'work_item', 'w');
  const edit = { action: 'edit', title: 'Work', summary: '', assignedActorIds: [], projectId: 'p2', parentId: null };
  assert.throws(() => applyOwnerAction(core, 'work_item', 'w', { ...edit, token: view.token }), /child/);
  view = ownerActionView(core, 'work_item', 'child');
  core = applyOwnerAction(core, 'work_item', 'child', { ...edit, title: 'Child', token: view.token });
  view = ownerActionView(core, 'work_item', 'w');
  core = applyOwnerAction(core, 'work_item', 'w', { ...edit, token: view.token });
  assert.equal(core.workItems.find(item => item.id === 'w')?.projectId, 'p2');
  assert.deepEqual(core.workItems.find(item => item.id === 'w')?.metadata.externalBindings, [{ externalId: '42' }]);
});

test('Core owner API shares preview eligibility with serialized apply and preserves unknown commands', async t => {
  const store = new MemoryCoreStore(upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core);
  const server = createServer(async (request, response) => {
    if (!await routeCoreApi({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store } })) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/core/owner/project/p`;
  const view = await (await fetch(url)).json();
  const command = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pause', token: view.token }) });
  const results = await Promise.all([command(), command()]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((await store.readCore()).projects[0].status, 'paused');
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })).status, 400);
});

test('persisted action tokens ignore projection clocks; deletion cannot return through backup recovery', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-owner-planning-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  await writeFile(file, JSON.stringify(buildPersistedChatSnapshot(createDefaultChatState(), core)));
  const store = new FileChatStore(file);
  const view = ownerActionView(await store.readCore(), 'project', 'p');
  await store.updateCore(current => applyOwnerAction(current, 'project', 'p', { action: 'pause', token: view.token }));
  const next = ownerActionView(await store.readCore(), 'project', 'p');
  await store.updateCore(current => applyOwnerAction(current, 'project', 'p', { action: 'delete', token: next.token }));
  assert.equal(JSON.parse(await readFile(file + '.bak', 'utf8')).projects.length, 0);
  await writeFile(file, '{damaged');
  assert.equal((await new FileChatStore(file).readCore()).projects.length, 0);
});

test('artifact batches recheck the exact selection atomically and reject stale previews', async t => {
  let core = upsertCoreArtifact(createDefaultCoreState(), { id: 'a', title: 'One', kind: 'file' }).core;
  core = upsertCoreArtifact(core, { id: 'b', title: 'Two', kind: 'file' }).core;
  const store = new MemoryCoreStore(core);
  const server = createServer(async (request, response) => { if (!await routeCoreApi({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store } })) { response.writeHead(404); response.end(); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/core/owner/artifact/batch`;
  const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const preview = await (await post({ action: 'preview', ids: ['a', 'b'] })).json();
  assert.deepEqual(preview.items.map((item: any) => item.title), ['One', 'Two']);
  assert.equal((await post({ action: 'archive', ids: ['a', 'missing'], token: preview.token })).status, 404);
  assert.equal((await store.readCore()).ownerLifecycle, undefined);
  assert.equal((await post({ action: 'archive', ids: ['a'], token: preview.token })).status, 409);
  assert.equal((await post({ action: 'archive', ids: ['a', 'b'], token: preview.token })).status, 200);
  assert.equal((await post({ action: 'restore', ids: ['a', 'b'], token: preview.token })).status, 409);
  assert.equal((await store.readCore()).ownerLifecycle?.entries['artifact:b'].listing, 'archived');
});
