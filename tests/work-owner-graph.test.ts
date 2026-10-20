import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultCoreState, upsertCoreTask, upsertCoreWorkItem, upsertCoreRun, upsertCoreConversation } from '../src/core/model/index.ts';
import { buildWorkGraphProjection } from '../src/products/work/api/workGraphProjection.ts';
import { applyOwnerRelationship, ownerRelationshipView } from '../src/products/work/state/ownerRelationships.ts';
import { setOwnerEntry } from '../src/core/ownerLifecycle.ts';
import { listOwnerRecords } from '../src/core/ownerActions.ts';

test('complete graph retains all sources, exposes canonical details and repairs actual anchor diagnostics', () => {
  let core = upsertCoreConversation(createDefaultCoreState(), { id: 'conversation', title: 'Chat room', kind: 'chat_channel', sourceChannelId: 'channel' }).core;
  core = upsertCoreTask(core, { id: 'code-task', title: 'Code task', metadata: { planning: { productHint: 'code' } } }).core;
  core = upsertCoreTask(core, { id: 'chat-task', title: 'Room task', conversationId: 'conversation', metadata: { source: 'chat-channel', originSurface: 'chat' } }).core;
  core = upsertCoreRun(core, { id: 'room-run', title: 'Room attempt', status: 'completed', conversationId: 'conversation', metadata: { source: 'chat-room-workflow' } }).core;
  core = upsertCoreWorkItem(core, { id: 'work', title: 'Unorganized work', projectId: 'missing' }).core;
  let graph = buildWorkGraphProjection(core);
  assert.equal(graph.objects.find(object => object.id === 'code-task')?.canonicalPath, '/code/tasks/code-task');
  assert.equal(graph.objects.find(object => object.id === 'conversation')?.canonicalPath, '/chat/chats/channel');
  assert.equal(graph.objects.find(object => object.id === 'room-run')?.ownerManaged, false);
  assert.equal(graph.objects.find(object => object.id === 'chat-task')?.ownerManaged, false);
  assert.ok(graph.diagnostics.some(diagnostic => diagnostic.kind === 'broken_fk' && diagnostic.objectId === 'work'));
  assert.equal(graph.diagnostics.some(diagnostic => diagnostic.kind === 'unanchored_run' && diagnostic.objectId === 'room-run'), false);
  const view = ownerRelationshipView(core, 'work_item', 'work');
  core = applyOwnerRelationship(core, 'work_item', 'work', { token: view.token, field: 'projectId', targetId: null });
  graph = buildWorkGraphProjection(core);
  assert.equal(graph.diagnostics.some(diagnostic => diagnostic.kind === 'broken_fk' && diagnostic.objectId === 'work'), false);
  assert.ok(graph.diagnostics.some(diagnostic => diagnostic.kind === 'missing_project_anchor' && diagnostic.objectId === 'work'));
  assert.ok(graph.objects.some(object => object.id === 'room-run'));
});

test('archived display intent never hides new active work on the same producer identity', () => {
  let core = upsertCoreTask(createDefaultCoreState(), { id: 'task', title: 'Task', status: 'completed' }).core;
  core = setOwnerEntry(core, 'task', 'task', { listing: 'archived' });
  assert.equal(listOwnerRecords(core, 'task')[0].listing, 'archived');
  assert.equal(buildWorkGraphProjection(core).objects.find(object => object.id === 'task')?.ownerListing, 'archived');
  core = upsertCoreTask(core, { id: 'task', title: 'Task', status: 'in_progress' }).core;
  assert.equal(core.ownerLifecycle?.entries['task:task'].listing, 'archived');
  assert.equal(listOwnerRecords(core, 'task')[0].listing, 'visible');
  assert.equal(buildWorkGraphProjection(core).objects.find(object => object.id === 'task')?.ownerListing, 'visible');
});
