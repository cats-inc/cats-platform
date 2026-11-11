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
  WORK_PROPOSAL_UPDATE,
} from '../src/products/work/agentTools/workConversationProposals.js';
import { createWorkConversationToolsProvider } from '../src/products/work/agentTools/workConversationTools.js';
import { createWorkIntakeDelegate } from '../src/products/work/state/workIntakeDelegate.js';
import { createWorkTriageDelegate } from '../src/products/work/state/workTriageDelegate.js';

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

function setup() {
  const coreStore = new MemoryCoreStore(seedCore());
  const intake = createWorkIntakeDelegate({ coreStore, now: () => NOW });
  const triage = createWorkTriageDelegate({ coreStore, now: () => NOW });
  const kinds = new ConversationProposalKindRegistry();
  for (const kind of createWorkProposalKinds({ intake, triage })) kinds.register(kind);
  const context = async (): Promise<ConversationProposalContext> =>
    ({ channelId: 'own', conversationId: OWN, core: await coreStore.readCore(), level: 'work' });
  const actors = { proposerParticipantId: 'participant-1', ownerActorId: 'owner-actor' };
  return { coreStore, kinds, context, actors };
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
  assert.deepEqual(kind.describe(withTask, ctx).folderWarning, { folder: 'C:/work/site', otherConversations: 0, workItems: 0 });
  await kind.perform(plain, ctx, h.actors);
  assert.equal((await h.coreStore.readCore()).workItems.find((entry) => entry.id === 'wi-captured')!.projectId, 'project-site');
});

test('create project: without a folder, with this conversation as its primary conversation', async () => {
  const h = setup();
  const kind = h.kinds.get(WORK_PROPOSAL_CREATE_PROJECT)!;
  const ctx = await h.context();
  assert.equal(refusalOf(() => kind.validate({ title: 'Docs', repoPath: 'C:/x' }, ctx)), 'folder_not_supported');
  assert.equal(refusalOf(() => kind.validate({ summary: 'no title' }, ctx)), 'invalid_arguments');
  const content = kind.validate({ title: 'Docs site', summary: 'Public docs' }, ctx);
  await kind.perform(content, ctx, h.actors);
  const project = (await h.coreStore.readCore()).projects.find((entry) => entry.title === 'Docs site')!;
  assert.equal(project.repoPath, null);
  assert.equal(project.primaryConversationId, OWN);
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
