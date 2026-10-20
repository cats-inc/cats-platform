import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createDefaultCoreState, upsertCoreProject, upsertCoreWorkItem, upsertCoreTask, upsertCoreRun, removeCoreProject, removeCoreTask } from '../src/core/model/index.ts';
import { upsertCoreWorkGraphLink } from '../src/core/model/linkRecords.ts';
import { ownerDeleteBlockers } from '../src/core/ownerManagement.ts';
import { MemoryCoreStore } from '../src/core/store.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { buildPersistedChatSnapshot } from '../src/products/chat/state/core-snapshot/index.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { routeWorkApi } from '../src/products/work/api/index.ts';
import { setOwnerEntry } from '../src/core/ownerLifecycle.ts';

test('referenced planning objects and active/derived tasks cannot be removed at the Core boundary', () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreWorkItem(core, { id: 'w', title: 'Work', projectId: 'p' }).core;
  assert.throws(() => removeCoreProject(core, 'p'), /work_item: Work/);
  core = upsertCoreTask(core, { id: 't', title: 'Task', status: 'in_progress' }).core;
  assert.throws(() => removeCoreTask(core, 't'), /active work/);
  core = upsertCoreTask(core, { id: 't', title: 'Task', status: 'completed', metadata: { source: 'chat-channel' } }).core;
  assert.throws(() => removeCoreTask(core, 't'), /source conversation/);
  core = upsertCoreTask(core, { id: 't', title: 'Task', status: 'completed', metadata: {} }).core;
  core = upsertCoreRun(core, { id: 'r', title: 'Attempt', status: 'completed', taskId: 't' }).core;
  assert.ok(ownerDeleteBlockers(core, 'task', 't').some(reason => reason.includes('Attempt')));
  assert.equal(core.projects.length, 1);
  assert.equal(core.tasks.length, 1);
});

test('WorkGraphLinks survive snapshot normalization and owner mutations, including unresolved endpoints', async () => {
  let core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  core = upsertCoreTask(core, { id: 't', title: 'Task' }).core;
  core = upsertCoreWorkGraphLink(core, { kind: 'related_to', sourceRecordFamily: 'project', sourceRecordId: 'p', targetRecordFamily: 'task', targetRecordId: 't' }).core;
  const store = new MemoryChatStore(buildPersistedChatSnapshot(createDefaultChatState(), core));
  assert.equal((await store.readCore()).workGraphLinks.length, 1);
  await store.updateCore(current => setOwnerEntry(current, 'task', 't', { listing: 'archived' }));
  assert.equal((await store.readCore()).workGraphLinks[0].id, core.workGraphLinks[0].id);
  assert.throws(() => removeCoreTask(core, 't'), /link:/);
  const broken = new MemoryChatStore(buildPersistedChatSnapshot(createDefaultChatState(), { ...core, projects: [] }));
  assert.equal((await broken.readCore()).workGraphLinks.length, 1);
});

test('product Delete reports a 409 without mutation, and unreferenced draft deletion still succeeds', async t => {
  const core = upsertCoreProject(createDefaultCoreState(), { id: 'p', title: 'Project' }).core;
  const store = new MemoryCoreStore(upsertCoreWorkItem(core, { id: 'w', title: 'Child', projectId: 'p' }).core);
  const server = createServer(async (request, response) => {
    const handled = await routeWorkApi({ request, response, method: request.method!, url: new URL(request.url!, 'http://localhost'), dependencies: { coreStore: store } });
    if (!handled) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = (server.address() as { port: number }).port;
  const request = (family: string, id: string) => fetch(`http://127.0.0.1:${port}/api/work/${family}/${id}`, { method: 'DELETE' });
  const blocked = await request('projects', 'p');
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error.code, 'owner_delete_blocked');
  assert.equal((await store.readCore()).projects.length, 1);
  assert.equal((await request('work-items', 'w')).status, 200);
  assert.equal((await request('projects', 'p')).status, 200);
  assert.equal((await request('projects', 'p')).status, 404);
});
