import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import { upsertCoreProject, upsertCoreRun, upsertCoreWorkItem } from '../build/server/core/model/index.js';
import { ownerActionView } from '../build/server/core/ownerActions.js';
import { ConversationProposalRefusal } from '../build/server/platform/proposals/contracts.js';
import { applyChannelWorkProject } from '../build/server/products/chat/api/conversationWorkProject.js';
import { createConversationWorkProjectProposalKind } from '../build/server/products/chat/api/conversationWorkProjectProposal.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel } from '../build/server/products/chat/state/model/index.js';
import { FileChatStore, MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { buildWorkProjectListProjection } from '../build/server/products/work/api/projection.js';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';

const NOW = new Date('2026-11-12T09:00:00.000Z');

async function setup({ origin = 'work' } = {}) {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, NOW);
  state = createChannel(state, { title: 'Launch', topic: 'Launch plan', originSurface: origin }, NOW);
  const channelId = state.selectedChannelId;
  state = createChannel(state, { title: 'Sibling', topic: 'Other work', originSurface: 'work' }, NOW);
  const siblingId = state.selectedChannelId;
  const store = new MemoryChatStore(state);
  let core = await store.readCore();
  core = upsertCoreProject(core, { id: 'project-site', title: 'Site', status: 'active', summary: null,
    repoPath: 'C:/work/site', primaryConversationId: null }, NOW).core;
  core = upsertCoreProject(core, { id: 'project-bare', title: 'Bare', status: 'active', summary: null }, NOW).core;
  core = upsertCoreProject(core, { id: 'project-old', title: 'Old', status: 'archived', summary: null }, NOW).core;
  // A captured Work Item parented under the conversation's projected Work Item.
  core = upsertCoreWorkItem(core, { id: 'wi-child', title: 'Child', status: 'draft', conversationId: `conversation-channel-${channelId}`,
    parentWorkItemId: `work-item-chat-channel-${channelId}`, taskId: null }, NOW).core;
  await store.writeCore(core);
  return { store, channelId, siblingId };
}

const projected = (core, channelId) => core.workItems.find((entry) => entry.id === `work-item-chat-channel-${channelId}`);
const channelOf = async (store, channelId) => (await store.read()).channels.find((entry) => entry.id === channelId);

async function addRun(store, channelId, { status, turn }) {
  const core = await store.readCore();
  await store.writeCore(upsertCoreRun(core, { id: `run-${status}-${turn ? 'turn' : 'supervised'}`, title: 'Run', status,
    conversationId: `conversation-channel-${channelId}`, taskId: `task-channel-${channelId}`,
    metadata: turn ? { source: 'chat-room-workflow' } : {} }, NOW).core);
}

test('the owner puts a Work conversation into a Project: its projected Work Item and children follow (FR-22 to FR-24)', async () => {
  const { store, channelId } = await setup();
  const outcome = await applyChannelWorkProject(store, { channelId, projectId: 'project-site', expectedRevision: 0, now: NOW });
  assert.deepEqual(outcome, { projectId: 'project-site', revision: 1 });
  assert.equal((await channelOf(store, channelId)).workProjectId, 'project-site');
  const core = await store.readCore();
  // FR-26: its supervised runs then start in the Project's folder, like any Work Item in a Project.
  assert.equal(projected(core, channelId).projectId, 'project-site');
  assert.equal(projected(core, channelId).taskId, `task-channel-${channelId}`);
  assert.equal(core.workItems.find((entry) => entry.id === 'wi-child').projectId, 'project-site');
  const activity = core.activities.find((entry) => entry.metadata?.conversationWorkProject);
  assert.equal(activity.actorId, core.ownerProfile.actorId);
  assert.deepEqual(activity.metadata.conversationWorkProject, { previous: null, projectId: 'project-site' });

  // Work lists the conversation under the Project.
  const listed = buildWorkProjectListProjection(core).projects.find((entry) => entry.id === 'project-site');
  assert.deepEqual(listed.memberConversations.map((entry) => entry.sourceChannelId), [channelId]);

  // A stale revision is refused; clearing goes back under No project.
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: null, expectedRevision: 0, now: NOW }),
    { refusal: 'revision_stale' });
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: null, expectedRevision: 1, now: NOW }),
    { projectId: null, revision: 2 });
  assert.equal(projected(await store.readCore(), channelId).projectId, null);
});

test('the Project and its revision survive the state file, and a cleared one stays cleared', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-work-project-file-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const statePath = path.join(dir, 'chat-state.local.json');
  const store = new FileChatStore(statePath);
  let state = createChannel(await store.read(), { title: 'Launch', topic: 'Launch plan', originSurface: 'work' }, NOW);
  const channelId = state.selectedChannelId;
  await store.write(state);
  const core = await store.readCore();
  await store.writeCore(upsertCoreProject(core, { id: 'project-site', title: 'Site', status: 'active', summary: null }, NOW).core);
  const stale = await store.read();
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: 'project-site', expectedRevision: 0, now: NOW }),
    { projectId: 'project-site', revision: 1 });
  const reopened = new FileChatStore(statePath);
  let channel = (await reopened.read()).channels.find((entry) => entry.id === channelId);
  assert.equal(channel.workProjectId, 'project-site', 'a fresh read of the file keeps the Project');
  assert.equal(channel.workProjectRevision, 1);
  assert.equal(projected(await reopened.readCore(), channelId).projectId, 'project-site');
  await reopened.write(stale);
  channel = (await new FileChatStore(statePath).read()).channels.find((entry) => entry.id === channelId);
  assert.equal(channel.workProjectId, 'project-site', 'a stale whole-state write through the file store keeps it');
  await applyChannelWorkProject(reopened, { channelId, projectId: null, expectedRevision: 1, now: NOW });
  channel = (await new FileChatStore(statePath).read()).channels.find((entry) => entry.id === channelId);
  assert.equal(channel.workProjectId, null);
  assert.equal(channel.workProjectRevision, 2, 'the revision outlives a clear, so an older copy cannot bring the Project back');
});

test('the refusals of FR-23: level, archived or unknown Project, and a supervised run under way', async () => {
  const chat = await setup({ origin: 'chat' });
  assert.deepEqual(await applyChannelWorkProject(chat.store, { channelId: chat.channelId, projectId: 'project-site', now: NOW }),
    { refusal: 'not_work_level' });
  const { store, channelId } = await setup();
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: 'project-old', now: NOW }), { refusal: 'project_archived' });
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: 'nope', now: NOW }), { refusal: 'project_not_found' });
  // A Turn Run, even blocked or running, does not count.
  await addRun(store, channelId, { status: 'running', turn: true });
  await addRun(store, channelId, { status: 'blocked', turn: false });
  assert.equal('refusal' in await applyChannelWorkProject(store, { channelId, projectId: 'project-site', now: NOW }), false);
  await addRun(store, channelId, { status: 'queued', turn: false });
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: 'project-bare', now: NOW }),
    { refusal: 'supervised_run_active' });
});

test('a parallel member cannot belong to a Project', async () => {
  const { store, channelId } = await setup();
  const state = await store.read();
  await store.write({ ...state, parallelChatGroups: [{ id: 'group-1', title: 'G', mode: 'compare', status: 'active',
    memberChannelIds: [channelId], createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lastMessageAt: null }] });
  assert.deepEqual(await applyChannelWorkProject(store, { channelId, projectId: 'project-site', now: NOW }), { refusal: 'parallel_member' });
});

test("a whole-state write that read the state before the owner's change does not undo it", async () => {
  const { store, channelId } = await setup();
  const stale = await store.read();
  await applyChannelWorkProject(store, { channelId, projectId: 'project-site', now: NOW });
  // A turn that read the state before the change writes its copy back afterwards.
  await store.write(stale);
  assert.equal((await channelOf(store, channelId)).workProjectId, 'project-site');
  assert.equal(projected(await store.readCore(), channelId).projectId, 'project-site');
});

test('a Project that no longer exists is projected as no Project', async () => {
  const { store, channelId } = await setup();
  await applyChannelWorkProject(store, { channelId, projectId: 'project-bare', now: NOW });
  const core = await store.readCore();
  await store.writeCore({ ...core, projects: core.projects.filter((entry) => entry.id !== 'project-bare') });
  await store.write(await store.read());
  assert.equal(projected(await store.readCore(), channelId).projectId, null);
});

test('FR-27: Turn Runs are not a Project\'s active work, and conversations block its deletion', async () => {
  const { store, channelId } = await setup();
  await applyChannelWorkProject(store, { channelId, projectId: 'project-site', now: NOW });
  await addRun(store, channelId, { status: 'running', turn: true });
  let view = ownerActionView(await store.readCore(), 'project', 'project-site');
  const blockersOf = (action) => view.actions.find((entry) => entry.action === action).blockers;
  assert.deepEqual(blockersOf('edit'), []);
  assert.deepEqual(blockersOf('pause'), []);
  assert.deepEqual(blockersOf('archive'), []);
  assert.ok(blockersOf('delete').some((line) => line.startsWith('Take its conversations out of this Project first: Launch')));
  // A supervised run of the conversation's Task is active work.
  await addRun(store, channelId, { status: 'running', turn: false });
  view = ownerActionView(await store.readCore(), 'project', 'project-site');
  assert.notDeepEqual(blockersOf('pause'), []);
  // Work's own controls still refuse to edit the projected Work Item.
  const own = ownerActionView(await store.readCore(), 'work_item', `work-item-chat-channel-${channelId}`);
  assert.ok(own.actions.find((entry) => entry.action === 'edit').blockers.some((line) => /source conversation/u.test(line)));
});

test('the conversation kind: an admin coordinator proposes, the owner confirms, both are recorded (FR-13, FR-16, FR-19)', async () => {
  const { store, channelId, siblingId } = await setup();
  await applyChannelWorkProject(store, { channelId: siblingId, projectId: 'project-site', now: NOW });
  const kind = createConversationWorkProjectProposalKind({ chatStore: store, now: () => NOW });
  const context = async (overrides = {}) => ({
    channelId, conversationId: `conversation-channel-${channelId}`, core: await store.readCore(), level: 'work',
    parallelMember: false, workProjectId: (await channelOf(store, channelId)).workProjectId ?? null,
    workProjectRevision: (await channelOf(store, channelId)).workProjectRevision ?? 0,
    otherConversationsInProject: (projectId) => projectId === 'project-site' ? 1 : 0, ...overrides,
  });
  const refusal = (action) => { try { action(); return null; } catch (error) { if (error instanceof ConversationProposalRefusal) return error.code; throw error; } };
  const ctx = await context();
  assert.equal(refusal(() => kind.validate({ projectId: 'project-old' }, ctx)), 'project_archived');
  assert.equal(refusal(() => kind.validate({ projectId: 'nope' }, ctx)), 'project_not_found');
  assert.equal(refusal(() => kind.validate({ projectId: 'project-site' }, { ...ctx, parallelMember: true })), 'parallel_member');
  assert.equal(refusal(() => kind.validate({ projectId: 'project-site' }, { ...ctx, workProjectId: 'project-site' })), 'unchanged');
  const content = kind.validate({ projectId: 'project-site' }, ctx);
  const view = kind.describe(content, ctx);
  assert.deepEqual(view.folderWarning, { folder: 'C:/work/site', otherConversations: 1, workItems: 1 });
  assert.equal(kind.describe(kind.validate({ projectId: 'project-bare' }, ctx), ctx).folderWarning, null);
  const before = JSON.stringify(kind.binding(content, ctx));
  await kind.perform(content, ctx, { proposerParticipantId: 'participant-boss', ownerActorId: 'owner-actor' });
  assert.equal((await channelOf(store, channelId)).workProjectId, 'project-site');
  const activity = (await store.readCore()).activities.find((entry) =>
    entry.metadata?.conversationWorkProject && entry.workItemId === `work-item-chat-channel-${channelId}`);
  assert.equal(activity.actorId, 'chat-participant:participant-boss');
  assert.equal(activity.metadata.confirmedByActorId, 'owner-actor');
  assert.notEqual(JSON.stringify(kind.binding(content, await context())), before, 'the card is bound to the Project it changes');
  // A card confirmed after the owner changed the Project is refused (FR-18).
  const second = kind.validate({ projectId: 'project-bare' }, await context());
  await applyChannelWorkProject(store, { channelId, projectId: null, now: NOW });
  await assert.rejects(kind.perform(second, await context({ workProjectRevision: 1 }), { proposerParticipantId: null, ownerActorId: 'owner-actor' }),
    (error) => error instanceof ConversationProposalRefusal && error.code === 'revision_stale');
  // A supervised run under way refuses the proposal too.
  await addRun(store, channelId, { status: 'queued', turn: false });
  const fresh = await context();
  assert.equal(refusal(() => kind.validate({ projectId: 'project-bare' }, fresh)), 'supervised_run_active');
});

test('the owner route reads and changes the Project, for an owner principal only', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-work-project-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'state'), { recursive: true });
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now: new Date(), sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs });
  const { store, channelId } = await setup();
  const server = createServer({
    shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '',
      platformDir: dir, chatStatePath: path.join(dir, 'state', 'chat-state.local.json'), runtimeDataDir: path.join(dir, 'runtime'),
      auth: authConfig }, authStore: auth.authStore, runtimeClient: { async getHealth() { return { reachable: true, status: 'ok' }; } } },
    chat: { chatStore: store },
  });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const url = `http://127.0.0.1:${server.address().port}/api/channels/${channelId}/work-project`;
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:8181', cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken };

  const read = await (await fetch(url, { headers })).json();
  assert.equal(read.projectId, null);
  assert.equal(read.canChange, true);
  assert.deepEqual(read.projects.map((entry) => entry.id).sort(), ['project-bare', 'project-site'], 'archived Projects are not offered');
  assert.equal(read.projects.find((entry) => entry.id === 'project-site').folder, 'C:/work/site');

  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ projectId: 'project-site' }) })).status, 400,
    'the revision the owner saw is required');
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'x-cats-csrf-token': 'wrong' },
    body: JSON.stringify({ projectId: 'project-site', revision: 0 }) })).status, 403, 'CSRF');
  const archived = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ projectId: 'project-old', revision: 0 }) });
  assert.equal(archived.status, 409);
  assert.equal((await archived.json()).error.code, 'project_archived');

  const authState = await auth.authStore.readState();
  authState.memberships[0].roles = ['member'];
  await auth.authStore.writeState(authState);
  assert.equal((await fetch(url, { headers })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ projectId: 'project-site', revision: 0 }) })).status, 403);
  authState.memberships[0].roles = ['owner'];
  await auth.authStore.writeState(authState);

  const set = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ projectId: 'project-site', revision: 0 }) });
  assert.equal(set.status, 200);
  assert.deepEqual(await set.json(), { projectId: 'project-site', revision: 1 });
  const stale = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ projectId: null, revision: 0 }) });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'revision_stale');
  assert.equal((await (await fetch(url, { headers })).json()).project.title, 'Site');
});
