import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultCoreState, upsertCoreProject, upsertCoreWorkItem } from '../src/core/model/index.js';
import { MemoryCoreStore } from '../src/core/store.js';
import type { CatsCoreState } from '../src/core/types.js';
import type { HostToolGrant } from '../src/platform/mcp/hostTools.js';
import {
  ConversationProposalKindRegistry,
  ConversationProposalRefusal,
  type ConversationProposalContext,
} from '../src/platform/proposals/contracts.js';
import {
  createWorkProposalKinds,
  WORK_PROPOSAL_ASSIGN_PROJECT,
  WORK_PROPOSAL_CAPTURE,
  WORK_PROPOSAL_CREATE_PROJECT,
  WORK_PROPOSAL_PROJECT_FOLDER,
  WORK_PROPOSAL_UPDATE,
} from '../src/products/work/agentTools/workConversationProposals.js';
import { createWorkConversationToolsProvider } from '../src/products/work/agentTools/workConversationTools.js';
import { createWorkIntakeDelegate } from '../src/products/work/state/workIntakeDelegate.js';
import { createDefaultChatState } from '../src/products/chat/state/defaults.js';
import { assignCatToChannel, createCat, createChannel } from '../src/products/chat/state/model/index.js';
import { isAdminCoordinator } from '../src/products/chat/state/coordinator.js';
import { createWorkTriageDelegate } from '../src/products/work/state/workTriageDelegate.js';
import { normalizeWorkProjectFolder, visibleWorkProjectFolder } from '../src/products/work/state/workProjectFolder.js';

const NOW = new Date('2026-11-12T08:00:00.000Z');
const OWN = 'conversation-channel-own';
const OTHER = 'conversation-channel-other';

function seedCore(): CatsCoreState {
  let core = createDefaultCoreState();
  core = upsertCoreProject(core, { id: 'project-site', title: 'Site', status: 'active', summary: 'The website',
    repoPath: 'C:/work/site', primaryConversationId: null }, NOW).core;
  core = upsertCoreProject(core, { id: 'project-old', title: 'Old', status: 'archived', summary: null }, NOW).core;
  core = upsertCoreWorkItem(core, { id: 'wi-projected', title: 'Own conversation', status: 'in_progress',
    conversationId: OWN, taskId: 'task-channel-own', metadata: { source: 'chat-channel' } }, NOW).core;
  core = upsertCoreWorkItem(core, { id: 'wi-captured', title: 'Write the copy', status: 'draft',
    conversationId: OWN, taskId: null }, NOW).core;
  core = upsertCoreWorkItem(core, { id: 'wi-with-task', title: 'Build the page', status: 'planned',
    conversationId: OWN, taskId: 'task-build' }, NOW).core;
  core = upsertCoreWorkItem(core, { id: 'wi-other', title: 'Someone else\'s', status: 'draft',
    conversationId: OTHER, taskId: null }, NOW).core;
  return core;
}

function setup(options: { workProjectId?: string | null; parallelMember?: boolean; joinRefusal?: string | null; revision?: number } = {}) {
  const coreStore = new MemoryCoreStore(seedCore());
  const intake = createWorkIntakeDelegate({ coreStore, now: () => NOW });
  const triage = createWorkTriageDelegate({ coreStore, now: () => NOW });
  const kinds = new ConversationProposalKindRegistry();
  const joins: Array<{ channelId: string; projectId: string }> = [];
  const joinOptions: Array<Record<string, unknown>> = [];
  for (const kind of createWorkProposalKinds({
    intake, triage, coreStore, platform: 'win32',
    async joinConversationProject(channelId, projectId, join) {
      joins.push({ channelId, projectId });
      joinOptions.push(join);
      return options.joinRefusal ?? null;
    },
  })) kinds.register(kind);
  const context = async (): Promise<ConversationProposalContext> => ({
    channelId: 'own', conversationId: OWN, core: await coreStore.readCore(), level: 'work',
    parallelMember: options.parallelMember ?? false,
    workProjectId: options.workProjectId ?? null,
    workProjectRevision: options.revision ?? 0,
    otherConversationsInProject: (projectId) => projectId === 'project-site' ? 2 : 0,
  });
  const actors = { proposerParticipantId: 'participant-1', ownerActorId: 'owner-actor' };
  return { coreStore, kinds, context, actors, joins, joinOptions };
}

function refusalOf(action: () => unknown): string | null {
  try { action(); return null; } catch (error) {
    if (error instanceof ConversationProposalRefusal) return error.code;
    throw error;
  }
}

test('capture: new Work Items drawn from the conversation, with the proposer and the confirming owner', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_CAPTURE)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ items: [] }, ctx)), 'invalid_arguments');
  assert.equal(refusalOf(() => kind.validate({ items: Array.from({ length: 9 }, () => ({ title: 'x' })) }, ctx)), 'invalid_arguments');
  const content = kind.validate({ items: [{ title: ' Draft the FAQ ', summary: 'Five questions', priority: 'high' }] }, ctx);
  assert.deepEqual(content, { items: [{ title: 'Draft the FAQ', summary: 'Five questions', kind: null, priority: 'high' }] });
  assert.equal(kind.describe(content, ctx).title, 'New Work Item');
  await kind.perform(content, ctx, h.actors);
  const core = await h.coreStore.readCore();
  const created = core.workItems.find((entry) => entry.title === 'Draft the FAQ')!;
  assert.equal(created.conversationId, OWN);
  assert.equal(created.projectId, null);
  const activity = core.activities.find((entry) => entry.workItemId === created.id)!;
  assert.equal(activity.actorId, 'chat-participant:participant-1');
  assert.equal(activity.metadata.confirmedByActorId, 'owner-actor', 'the record keeps both actors');
});

test("update: only a captured Work Item of this conversation, never the projected one or another's", async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_UPDATE)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-projected', title: 'x' }, ctx)), 'projected_work_item');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-other', title: 'x' }, ctx)), 'work_item_not_found');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'missing', title: 'x' }, ctx)), 'work_item_not_found');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-captured' }, ctx)), 'invalid_arguments');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-captured', status: 'completed' }, ctx)), 'invalid_arguments');
  const content = kind.validate({ workItemId: 'wi-captured', title: 'Write the landing copy', priority: 'urgent', status: 'planned' }, ctx);
  // The binding changes when the Work Item does, so the card goes out of date.
  const before = JSON.stringify(kind.binding(content, ctx));
  await kind.perform(content, ctx, h.actors);
  const after = await h.context();
  const updated = after.core.workItems.find((entry) => entry.id === 'wi-captured')!;
  assert.equal(updated.title, 'Write the landing copy');
  assert.equal(updated.status, 'planned');
  assert.notEqual(JSON.stringify(kind.binding(content, after)), before);
});

test('assign: into an existing Project, with the folder warning when the Work Item has a Task', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_ASSIGN_PROJECT)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-captured', projectId: 'project-old' }, ctx)), 'project_archived');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-captured', projectId: 'nope' }, ctx)), 'project_not_found');
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-projected', projectId: 'project-site' }, ctx)), 'projected_work_item');
  const plain = kind.validate({ workItemId: 'wi-captured', projectId: 'project-site' }, ctx);
  assert.equal(kind.describe(plain, ctx).folderWarning, null, 'no Task, so no supervised run starts there');
  const withTask = kind.validate({ workItemId: 'wi-with-task', projectId: 'project-site' }, ctx);
  assert.deepEqual(kind.describe(withTask, ctx).folderWarning, { folder: 'C:/work/site', otherConversations: 2, workItems: 0 });
  await kind.perform(plain, ctx, h.actors);
  assert.equal((await h.coreStore.readCore()).workItems.find((entry) => entry.id === 'wi-captured')!.projectId, 'project-site');
});

test('create project: this conversation as its primary conversation, and it joins the Project when it has none', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ summary: 'no title' }, ctx)), 'invalid_arguments');
  const content = kind.validate({ title: 'Docs site', summary: 'Public docs' }, ctx);
  assert.equal(kind.describe(content, ctx).folderWarning, null);
  const result = await kind.perform(content, ctx, h.actors);
  const project = (await h.coreStore.readCore()).projects.find((entry) => entry.title === 'Docs site')!;
  assert.equal(project.repoPath, null);
  assert.equal(project.status, 'planned');
  assert.equal(project.primaryConversationId, OWN, 'FR-28');
  assert.deepEqual(h.joins, [{ channelId: 'own', projectId: project.id }], 'FR-13: the conversation joins it');
  assert.deepEqual(h.joinOptions, [{ expectedRevision: 0, actorId: 'chat-participant:participant-1', confirmedByActorId: 'owner-actor' }],
    'the join is bound to the revision the card was confirmed against and records both actors');
  assert.match(result.summary, /the conversation joined it/u);
  // Create is keyed by title and folder: a second card that matches returns the existing
  // Project, which it did not describe, so it refuses and joins nothing.
  const again = setup();
  const againKind = again.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const againCtx = await again.context();
  await againKind.perform(againKind.validate({ title: 'Twin', folder: 'C:/twin' }, againCtx), againCtx, again.actors);
  await assert.rejects(againKind.perform(againKind.validate({ title: 'twin', folder: 'C:/twin' }, againCtx), againCtx, again.actors),
    (error: unknown) => error instanceof ConversationProposalRefusal && error.code === 'project_exists');
  assert.equal(again.joins.length, 1, 'only the Project the first card created was joined');
});

test('create project with a folder: an absolute path on one line, shown whole with the warning (A1)', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder: 'relative/path' }, ctx)), 'invalid_folder');
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder: 'C:/x' + String.fromCharCode(10) + 'y' }, ctx)), 'invalid_folder');
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder: 'C:/x' + String.fromCodePoint(0x202E) }, ctx)), 'invalid_folder');
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder: 'C:/x' + String.fromCharCode(0x2028) + 'y' }, ctx)), 'invalid_folder');
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder: 'C:/' + 'd'.repeat(600) }, ctx)), 'invalid_folder');
  for (const folder of ['\\\\host\\share', '//host/share', '\\\\?\\C:\\x', 'C:/work/../secrets']) {
    assert.equal(refusalOf(() => kind.validate({ title: 'Docs', folder }, ctx)), 'invalid_folder', folder);
  }
  const longFolder = 'C:/' + 'd'.repeat(400);
  const content = kind.validate({ title: 'Docs', folder: longFolder, status: 'active' }, ctx);
  const view = kind.describe(content, ctx);
  assert.equal(view.fields.find((field) => field.name === 'folder')!.value, longFolder, 'shown whole');
  assert.deepEqual(view.folderWarning, { folder: longFolder, otherConversations: 0, workItems: 0 });
  // ADR-105's path names the folder as repoPath.
  assert.deepEqual(kind.validate({ title: 'Docs', repoPath: 'C:/docs' }, ctx), { title: 'Docs', status: 'planned', folder: 'C:/docs' });
  await kind.perform(content, ctx, h.actors);
  const project = (await h.coreStore.readCore()).projects.find((entry) => entry.title === 'Docs')!;
  assert.equal(project.repoPath, longFolder);
  assert.equal(project.status, 'active');
});

test('create project: a conversation in a Project, or a parallel member, does not join; a refused join is told', async () => {
  for (const options of [{ workProjectId: 'project-site' }, { parallelMember: true }]) {
    const h = setup(options);
    const kind = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
    const ctx = await h.context();
    const content = kind.validate({ title: 'Side' }, ctx);
    assert.match(kind.describe(content, ctx).records[0]!.title!, /primary conversation$/u);
    await kind.perform(content, ctx, h.actors);
    assert.deepEqual(h.joins, []);
  }
  const refused = setup({ joinRefusal: 'supervised_run_active' });
  const kind = refused.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const ctx = await refused.context();
  const result = await kind.perform(kind.validate({ title: 'Later' }, ctx), ctx, refused.actors);
  assert.match(result.summary, /did not join it \(supervised_run_active\)/u);
  // Whether it joins is part of the card: a change makes it out of date.
  const joined = await setup({ workProjectId: 'project-site' }).context();
  assert.notEqual(JSON.stringify(kind.binding({}, ctx)), JSON.stringify(kind.binding({}, joined)));
});

test('folders: absolute for this OS, no shares, devices or parent segments, and hidden characters shown', () => {
  assert.equal(normalizeWorkProjectFolder('C:/work/site', 'win32'), 'C:/work/site');
  assert.equal(normalizeWorkProjectFolder('/home/me/site', 'win32'), null, 'drive-relative on Windows');
  assert.equal(normalizeWorkProjectFolder('/home/me/site', 'linux'), '/home/me/site');
  assert.equal(normalizeWorkProjectFolder('C:/work/site', 'linux'), null);
  assert.equal(normalizeWorkProjectFolder('//host/share', 'linux'), null);
  assert.equal(normalizeWorkProjectFolder('/srv/../etc', 'linux'), null);
  assert.equal(visibleWorkProjectFolder('C:/a' + String.fromCharCode(0x200B) + 'b'), 'C:/a\\u{200B}b');
  assert.equal(visibleWorkProjectFolder(null), null);
});

test("what moves with the conversation is shown on the card and bound (FR-16, FR-18)", async () => {
  const h = setup();
  const core = await h.coreStore.readCore();
  const withProjected = { ...core, workItems: [...core.workItems,
    { ...core.workItems.find((entry) => entry.id === 'wi-projected')!, id: 'work-item-chat-channel-own' }] };
  await h.coreStore.writeCore(upsertCoreWorkItem(withProjected, { id: 'wi-child', title: 'Child with a Task', status: 'planned',
    conversationId: OWN, taskId: 'task-child', parentWorkItemId: 'work-item-chat-channel-own' }, NOW).core);
  const kind = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const ctx = await h.context();
  const content = kind.validate({ title: 'Docs', folder: 'C:/docs' }, ctx);
  const view = kind.describe(content, ctx);
  assert.equal(view.fields.find((field) => field.name === 'moves with it')!.value, '1 Work Item, some with a Task');
  assert.deepEqual(view.records.slice(1).map((record) => record.id), ['wi-child']);
  assert.equal(view.folderWarning!.workItems, 1);
  const before = JSON.stringify(kind.binding(content, ctx));
  const later = await h.coreStore.readCore();
  await h.coreStore.writeCore({ ...later, workItems: later.workItems.map((entry) => entry.id === 'wi-child'
    ? { ...entry, taskId: 'task-other', updatedAt: '2026-11-12T09:00:00.000Z' } : entry) });
  assert.notEqual(JSON.stringify(kind.binding(content, await h.context())), before, 'a change to a moving Work Item makes the card out of date');
  // The revision is bound too: a P to Q to P change in between makes the card out of date.
  const revised = setup({ revision: 2 });
  assert.notEqual(JSON.stringify(kind.binding(content, await revised.context())), JSON.stringify(kind.binding(content, await setup().context())));
});

test("an assignment proposed under the conversation's Project stays bound to it (FR-12)", async () => {
  const h = setup({ workProjectId: 'project-site' });
  const kind = h.kinds.get(WORK_PROPOSAL_ASSIGN_PROJECT)!;
  const ctx = await h.context();
  const content = kind.validate({ workItemId: 'wi-with-task', projectId: 'project-site', scope: 'conversation_project' }, ctx);
  assert.equal(content.scope, 'conversation_project');
  const other = setup({ workProjectId: null });
  const otherCtx = await other.context();
  assert.equal(refusalOf(() => kind.validate({ workItemId: 'wi-with-task', projectId: 'project-site', scope: 'conversation_project' }, otherCtx)),
    'not_conversation_project');
  assert.notEqual(JSON.stringify(kind.binding(content, ctx)), JSON.stringify(kind.binding(content, { ...ctx, workProjectId: null, workProjectRevision: 1 })),
    'the owner moving the conversation makes the card out of date');
  await assert.rejects(kind.perform(content, { ...ctx, workProjectId: null }, h.actors), (error: unknown) =>
    error instanceof ConversationProposalRefusal && error.code === 'not_conversation_project');
  // Without the mark, as an admin coordinator proposes, the card is not bound to the conversation's Project.
  const admin = kind.validate({ workItemId: 'wi-with-task', projectId: 'project-site' }, ctx);
  assert.equal(admin.scope, undefined);
});

test("capture joins the conversation's Project in the same write (FR-12, FR-19)", async () => {
  const h = setup({ workProjectId: 'project-site' });
  const kind = h.kinds.get(WORK_PROPOSAL_CAPTURE)!;
  const ctx = await h.context();
  const content = kind.validate({ items: [{ title: 'Ship the page' }] }, ctx);
  const view = kind.describe(content, ctx);
  assert.deepEqual(view.records.map((record) => record.kind), ['conversation', 'project']);
  assert.equal(view.folderWarning, null, 'a new Work Item has no Task');
  await kind.perform(content, ctx, h.actors);
  const core = await h.coreStore.readCore();
  const created = core.workItems.find((entry) => entry.title === 'Ship the page')!;
  assert.equal(created.projectId, 'project-site');
  // The Project is bound: if the conversation leaves it, the card goes out of date.
  const left = await setup().context();
  assert.notEqual(JSON.stringify(kind.binding(content, ctx)), JSON.stringify(kind.binding(content, left)));
  // A Project archived meanwhile refuses the capture instead of filing into it.
  const archived = setup({ workProjectId: 'project-old' });
  const archivedKind = archived.kinds.get(WORK_PROPOSAL_CAPTURE)!;
  const archivedCtx = await archived.context();
  await assert.rejects(archivedKind.perform(archivedKind.validate({ items: [{ title: 'Nope' }] }, archivedCtx), archivedCtx, archived.actors),
    (error: unknown) => error instanceof ConversationProposalRefusal);
  assert.equal((await archived.coreStore.readCore()).workItems.some((entry) => entry.title === 'Nope'), false);
});

test("project folder: only the conversation's own Project, with the reach of the change on the card (FR-13, FR-16)", async () => {
  const none = setup();
  const kind = none.kinds.get(WORK_PROPOSAL_PROJECT_FOLDER)!;
  const noneCtx = await none.context();
  assert.equal(refusalOf(() => kind.validate({ folder: 'C:/new' }, noneCtx)), 'no_conversation_project');
  const h = setup({ workProjectId: 'project-site' });
  const ctx = await h.context();
  const kindOf = h.kinds.get(WORK_PROPOSAL_PROJECT_FOLDER)!;
  assert.equal(refusalOf(() => kindOf.validate({ folder: 'not/absolute' }, ctx)), 'invalid_folder');
  assert.equal(refusalOf(() => kindOf.validate({ folder: 'C:/work/site' }, ctx)), 'unchanged');
  const content = kindOf.validate({ folder: 'D:/sites/main' }, ctx);
  assert.deepEqual(content, { projectId: 'project-site', folder: 'D:/sites/main' });
  const view = kindOf.describe(content, ctx);
  assert.equal(view.fields.find((field) => field.name === 'previous folder')!.value, 'C:/work/site');
  assert.deepEqual(view.folderWarning, { folder: 'D:/sites/main', otherConversations: 2, workItems: 0 });
  // The proposer's conversation left the Project before the owner confirmed: nothing is written.
  const moved = { ...ctx, workProjectId: null };
  await assert.rejects(kindOf.perform(content, moved, h.actors), (error: unknown) =>
    error instanceof ConversationProposalRefusal && error.code === 'not_conversation_project');
  await kindOf.perform(content, ctx, h.actors);
  const core = await h.coreStore.readCore();
  assert.equal(core.projects.find((entry) => entry.id === 'project-site')!.repoPath, 'D:/sites/main');
  const activity = core.activities.find((entry) => entry.projectId === 'project-site' && entry.metadata.workProjectFolder)!;
  assert.equal(activity.actorId, 'chat-participant:participant-1');
  assert.equal(activity.metadata.confirmedByActorId, 'owner-actor');
});

function grant(overrides: Partial<HostToolGrant['binding']> = {}): HostToolGrant {
  return { grantId: 'g', state: 'bound', runtimeSessionId: 'rt-1', issuedAt: NOW.toISOString(),
    binding: { channelId: 'own', conversationId: OWN, workspacePath: null, actorId: null, shellExecution: false,
      level: 'work', participantId: 'participant-1', proposalsAllowed: true, ...overrides } };
}

test('the tools read own Work Items, find Projects for an admin coordinator only, and propose only on the owner\'s turn', async () => {
  const h = setup();
  const proposals: Array<Record<string, unknown>> = [];
  let admin = false;
  const provider = createWorkConversationToolsProvider({
    coreStore: h.coreStore,
    proposals: { async propose(input) { proposals.push(input as never); return { proposalId: 'p-1', expiresAt: 'later' }; } },
    async isAdminCoordinator() { return admin; },
  });
  assert.equal(provider.level, 'work');
  const items = (await provider.callTool('get_work_items', {}, grant())).structuredContent as { workItems: Array<Record<string, unknown>> };
  assert.deepEqual(items.workItems.map((entry) => entry.id).sort(), ['wi-captured', 'wi-projected', 'wi-with-task']);
  assert.equal(items.workItems.find((entry) => entry.id === 'wi-projected')!.projected, true);
  assert.equal(items.workItems.find((entry) => entry.id === 'wi-captured')!.title, '«Write the copy»');

  const denied = await provider.callTool('find_projects', { query: 'site' }, grant());
  assert.equal((denied.structuredContent as { error: { code: string } }).error.code, 'admin_coordinator_required');
  assert.equal((await provider.callTool('propose_project', { title: 'X' }, grant())).isError, true);
  admin = true;
  const found = (await provider.callTool('find_projects', { query: 'site' }, grant())).structuredContent as { projects: Array<Record<string, unknown>> };
  assert.deepEqual(found.projects.map((entry) => entry.id), ['project-site']);
  assert.equal(found.projects[0]!.folder, '«C:/work/site»');

  const notOwner = await provider.callTool('propose_work_items', { items: [{ title: 'A' }] }, grant({ proposalsAllowed: false }));
  assert.equal((notOwner.structuredContent as { error: { code: string } }).error.code, 'not_owner_turn');
  assert.equal(proposals.length, 0, 'a Telegram turn or a heartbeat proposes nothing');
  const proposed = await provider.callTool('propose_work_items', { items: [{ title: 'A' }] }, grant());
  assert.deepEqual(proposed.structuredContent, { proposalId: 'p-1', status: 'waiting for the owner', expiresAt: 'later' });
  assert.deepEqual(proposals[0], { channelId: 'own', conversationId: OWN, kind: WORK_PROPOSAL_CAPTURE,
    content: { items: [{ title: 'A' }] }, proposerParticipantId: 'participant-1' });
});

test('the card shows exactly what is written: hidden characters removed, line breaks joined, long text refused', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_CAPTURE)!;
  const ctx = await h.context();
  const hidden = 'Plan' + String.fromCodePoint(0x202E) + String.fromCodePoint(0xE0049) + String.fromCodePoint(0x200B) + ' the' + String.fromCharCode(10) + 'launch';
  const content = kind.validate({ items: [{ title: hidden }] }, ctx) as { items: Array<{ title: string }> };
  assert.equal(content.items[0]!.title, 'Plan the launch', 'stored as the card shows it');
  assert.equal(kind.describe(content, ctx).fields[0]!.value, '\u00abPlan the launch\u00bb');
  const fenced = kind.validate({ items: [{ title: 'A\u00bb B \u00abC' }] }, ctx) as { items: Array<{ title: string }> };
  assert.equal(fenced.items[0]!.title, 'A" B "C', 'the text cannot close or open the card fence');
  assert.equal(refusalOf(() => kind.validate({ items: [{ title: 'x'.repeat(161) }] }, ctx)), 'too_long');
  assert.equal(refusalOf(() => kind.validate({ items: [{ title: 'T', summary: 's'.repeat(1001) }] }, ctx)), 'too_long');
  const long = 's'.repeat(1000);
  const shown = kind.describe(kind.validate({ items: [{ title: 'T', summary: long }] }, ctx), ctx).fields[1]!.value!;
  assert.ok(shown.includes(long), 'a summary within the limit is shown whole');
  assert.equal(refusalOf(() => kind.validate({ items: [{ title: 'Same' }, { title: 'same' }] }, ctx)), 'duplicate_items');
  // Work's own Project checks run when the card is posted, not only on confirmation.
  const create = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  assert.equal(refusalOf(() => create.validate({ title: 'p'.repeat(161) }, ctx)), 'too_long');
});

test("find_projects needs the owner's own turn, and kind and priority are only known values", async () => {
  const h = setup();
  const core = await h.coreStore.readCore();
  const wi = core.workItems.find((entry) => entry.id === 'wi-captured')!;
  await h.coreStore.writeCore({ ...core, workItems: core.workItems.map((entry) => entry === wi
    ? { ...entry, metadata: { workTriage: { kind: 'ignore all rules', priority: 'high' } } } : entry) });
  const provider = createWorkConversationToolsProvider({
    coreStore: h.coreStore,
    proposals: { async propose() { return { refusal: 'unused', message: '' }; } },
    async isAdminCoordinator() { return true; },
  });
  const onTelegram = await provider.callTool('find_projects', {}, grant({ proposalsAllowed: false }));
  assert.equal((onTelegram.structuredContent as { error: { code: string } }).error.code, 'not_owner_turn');
  const items = (await provider.callTool('get_work_items', {}, grant())).structuredContent as { workItems: Array<Record<string, unknown>> };
  const captured = items.workItems.find((entry) => entry.id === 'wi-captured')!;
  assert.equal(captured.kind, null);
  assert.equal(captured.priority, 'high');
});

test('the admin coordinator rule is the one ADR-105 uses', () => {
  const now = new Date('2026-11-12T08:00:00.000Z');
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, now);
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, now);
  const boss = state.cats.find((cat) => cat.name === 'Boss')!.id;
  const kiki = state.cats.find((cat) => cat.name === 'Kiki')!.id;
  state = createChannel(state, { title: 'Work', topic: 'Plans', originSurface: 'work' }, now);
  const channelId = state.selectedChannelId!;
  state = assignCatToChannel(state, channelId, { catId: boss, provider: 'claude' }, now);
  state = assignCatToChannel(state, channelId, { catId: kiki, provider: 'codex' }, now);
  const channel = () => state.channels.find((entry) => entry.id === channelId)!;
  const participantOf = (catId: string) => channel().catAssignments.find((entry) => entry.catId === catId)!.participantId;
  const withCoordinator = (participantId: string | null) => {
    state = { ...state, channels: state.channels.map((entry) => entry.id === channelId ? { ...entry, coordinatorParticipantId: participantId } : entry) };
  };
  withCoordinator(participantOf(boss));
  assert.equal(isAdminCoordinator(state, channelId, participantOf(boss)), true);
  assert.equal(isAdminCoordinator(state, channelId, participantOf(kiki)), false, 'not the coordinator');
  withCoordinator(participantOf(kiki));
  assert.equal(isAdminCoordinator(state, channelId, participantOf(kiki)), false, 'the coordinator, but not an admin Cat');
  assert.equal(isAdminCoordinator(state, channelId, participantOf(boss)), false, 'an admin Cat, but not the coordinator');
  assert.equal(isAdminCoordinator(state, channelId, null), false);
});

test("Phase 5 tools: the conversation's Project in get_work_items, and who may propose what beyond it", async () => {
  const h = setup();
  const core = await h.coreStore.readCore();
  // The conversation's Project, as its projected Work Item carries it.
  await h.coreStore.writeCore({ ...core, workItems: [...core.workItems,
    { ...core.workItems.find((entry) => entry.id === 'wi-projected')!, id: 'work-item-chat-channel-own', projectId: 'project-site' }] });
  const proposals: Array<Record<string, unknown>> = [];
  let admin = false;
  const provider = createWorkConversationToolsProvider({
    coreStore: h.coreStore,
    proposals: { async propose(input) { proposals.push(input as never); return { proposalId: 'p-1', expiresAt: 'later' }; } },
    async isAdminCoordinator() { return admin; },
  });
  assert.deepEqual(provider.tools.map((tool) => tool.name), ['get_work_items', 'find_projects', 'propose_work_items',
    'propose_work_item_change', 'propose_work_item_project', 'propose_conversation_project', 'propose_project', 'propose_project_folder']);
  const items = (await provider.callTool('get_work_items', {}, grant())).structuredContent as { project: Record<string, unknown> | null };
  assert.deepEqual(items.project, { id: 'project-site', title: '«Site»', status: 'active', folder: '«C:/work/site»' });

  // FR-12: the conversation's own Project is open to any participant, and the card is marked.
  const own = await provider.callTool('propose_work_item_project', { workItemId: 'wi-captured', projectId: 'project-site' }, grant());
  assert.equal(own.isError, undefined);
  assert.equal((proposals[0]!.content as Record<string, unknown>).scope, 'conversation_project');
  // FR-13: any other Project, the conversation's Project and a folder need an admin coordinator.
  for (const [name, args] of [
    ['propose_work_item_project', { workItemId: 'wi-captured', projectId: 'project-other' }],
    ['propose_conversation_project', { projectId: 'project-site' }],
    ['propose_project_folder', { folder: 'D:/x' }],
    ['propose_project', { title: 'X', folder: 'D:/x' }],
  ] as const) {
    const denied = await provider.callTool(name, args as Record<string, unknown>, grant());
    assert.equal((denied.structuredContent as { error: { code: string } }).error.code, 'admin_coordinator_required', name);
  }
  admin = true;
  await provider.callTool('propose_conversation_project', { projectId: 'project-site' }, grant());
  await provider.callTool('propose_project_folder', { folder: 'D:/x' }, grant());
  assert.deepEqual(proposals.map((entry) => entry.kind),
    [WORK_PROPOSAL_ASSIGN_PROJECT, 'conversation.work_project', WORK_PROPOSAL_PROJECT_FOLDER]);
  // Not on a turn the owner did not start, admin or not.
  const notOwner = await provider.callTool('propose_project_folder', { folder: 'D:/y' }, grant({ proposalsAllowed: false }));
  assert.equal((notOwner.structuredContent as { error: { code: string } }).error.code, 'not_owner_turn');
});
