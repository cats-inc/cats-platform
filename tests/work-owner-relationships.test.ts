import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createDefaultCoreState, upsertCoreProject, upsertCoreTask, upsertCoreWorkItem, upsertCoreRun, upsertCoreWorkGraphLink } from '../src/core/model/index.ts';
import { ownerRelationshipView, applyOwnerRelationship, previewOrphanLinks, applyOrphanLinks, ownerLinkView, repairOwnerLink } from '../src/products/work/state/ownerRelationships.ts';
import { routeOwnerRelationships } from '../src/products/work/api/ownerRelationshipRoutes.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FileChatStore } from '../src/products/chat/state/store.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';

test('anchor repair validates targets, cycles, source authority and active execution without changing identity', () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreWorkItem(core, { id: 'w', title: 'Unanchored work', projectId: 'missing' }).core;
  let view = ownerRelationshipView(core, 'work_item', 'w');
  core = applyOwnerRelationship(core, 'work_item', 'w', { token: view.token, field: 'projectId', targetId: 'p' });
  assert.equal(core.workItems[0].id, 'w'); assert.equal(core.workItems[0].projectId, 'p');
  assert.throws(() => applyOwnerRelationship(core, 'work_item', 'w', { token: view.token, field: 'projectId', targetId: null }), /changed/);
  core = upsertCoreTask(core, { id: 't', title: 'Task' }).core;
  core = upsertCoreTask(core, { id: 'child', title: 'Child', parentTaskId: 't' }).core;
  view = ownerRelationshipView(core, 'task', 't');
  assert.throws(() => applyOwnerRelationship(core, 'task', 't', { token: view.token, field: 'parentTaskId', targetId: 'child' }), /cycle/);
  core = upsertCoreRun(core, { id: 'r', title: 'Attempt', status: 'running', taskId: 't' }).core;
  view = ownerRelationshipView(core, 'task', 't');
  assert.throws(() => applyOwnerRelationship(core, 'task', 't', { token: view.token, field: 'parentTaskId', targetId: null }), /active/);
  core = upsertCoreRun(core, { id: 'r', title: 'Attempt', status: 'completed' }).core;
  view = ownerRelationshipView(core, 'run', 'r');
  core = applyOwnerRelationship(core, 'run', 'r', { token: view.token, field: 'taskId', targetId: 'child' });
  assert.equal(core.runs[0].taskId, 'child');
  core = upsertCoreTask(core, { id: 'derived', title: 'Derived', metadata: { source: 'chat-room-workflow' } }).core;
  view = ownerRelationshipView(core, 'task', 'derived');
  assert.throws(() => applyOwnerRelationship(core, 'task', 'derived', { token: view.token, field: 'parentTaskId', targetId: null }), /source/);
});

test('orphan batch binds exact IDs and restored endpoints; relink merges canonical duplicates cleanly', () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Old project' }).core;
  core = upsertCoreProject(core, { id: 'next', title: 'Replacement' }).core;
  core = upsertCoreTask(core, { id: 't', title: 'Task' }).core;
  core = upsertCoreWorkGraphLink(core, { id: 'orphan', kind: 'blocks', sourceRecordFamily: 'project', sourceRecordId: 'p', targetRecordFamily: 'task', targetRecordId: 't' }).core;
  core = upsertCoreWorkGraphLink(core, { id: 'valid', kind: 'blocks', sourceRecordFamily: 'project', sourceRecordId: 'next', targetRecordFamily: 'task', targetRecordId: 't' }).core;
  core = { ...core, projects: core.projects.filter(project => project.id !== 'p') };
  const preview = previewOrphanLinks(core, ['orphan']);
  assert.throws(() => previewOrphanLinks(core, ['valid']), /valid endpoints/);
  const restored = upsertCoreProject(core, { id: 'p', title: 'Restored' }).core;
  assert.throws(() => applyOrphanLinks(restored, { ids: ['orphan'], token: preview.token }), /valid endpoints/);
  assert.equal(applyOrphanLinks(core, { ids: ['orphan'], token: preview.token }).workGraphLinks.length, 1);
  const view = ownerLinkView(core, 'orphan');
  const relinked = repairOwnerLink(core, 'orphan', { token: view.token, source: 'project:next', target: 'task:t' });
  assert.deepEqual(relinked.workGraphLinks.map(link => link.id), ['valid']);
});

test('relationship HTTP apply serializes stale commands and returns truthful canonical merge results', async t => {
  let core = upsertCoreTask(createDefaultCoreState(), { id: 't', title: 'Task' }).core;
  core = upsertCoreTask(core, { id: 'parent', title: 'Parent' }).core;
  const store = new MemoryCoreStore(core);
  const server = createServer(async (request, response) => { if (!await routeOwnerRelationships({ request, response, url: new URL(request.url!, 'http://localhost'), method: request.method!, dependencies: { coreStore: store } })) { response.writeHead(404); response.end(); } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/work/relationships/task/t`;
  const view = await (await fetch(url)).json();
  const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: view.token, field: 'parentTaskId', targetId: 'parent' }) });
  assert.deepEqual((await Promise.all([post(), post()])).map(response => response.status).sort(), [200, 409]);
  assert.equal((await store.readCore()).tasks.find(task => task.id === 't')?.parentTaskId, 'parent');
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' })).status, 400);
});

test('removed orphan links stay removed after a Chat save and backup recovery', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cats-link-repair-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreTask(core, { id: 't', title: 'Task' }).core;
  core = upsertCoreWorkGraphLink(core, { id: 'removed', kind: 'blocks', sourceRecordFamily: 'project', sourceRecordId: 'p', targetRecordFamily: 'task', targetRecordId: 't' }).core;
  core = { ...core, projects: [] };
  const file = path.join(dir, 'state.json');
  await writeFile(file, JSON.stringify(buildPersistedChatSnapshot(createDefaultChatState(), core)));
  const store = new FileChatStore(file);
  const preview = previewOrphanLinks(await store.readCore(), ['removed']);
  await store.updateCore(core => applyOrphanLinks(core, { ids: ['removed'], token: preview.token }));
  await store.write(await store.read());
  assert.equal(JSON.parse(await readFile(file + '.bak', 'utf8')).workGraphLinks.length, 0);
  await writeFile(file, '{damaged');
  const recovered = await new FileChatStore(file).readCore();
  assert.equal(recovered.workGraphLinks.length, 0);
  assert.deepEqual(recovered.ownerLifecycle?.removedLinkIds, ['removed']);
});
