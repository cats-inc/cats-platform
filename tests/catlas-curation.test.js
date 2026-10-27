import assert from 'node:assert/strict';
import test from 'node:test';
import { catlasFixture, fixedNow, message } from './fixtures/catlasAssist.js';
import { buildCatlasSnapshot, hasUnresolvedCatlasChoice, internalCatlasSnapshot, catlasSnapshotEntries } from '../build/server/products/chat/api/catlasSnapshot.js';
import { applyCatlasCatalogOperations, validateCatlasRecommendations, validateCatlasTitle } from '../build/server/products/chat/api/catlasCuration.js';
import { createBuiltinGuideCatCatalog } from '../build/server/shared/guideCatAssistCatalog.js';
import { upsertCoreTask } from '../build/server/core/model/taskControls.js';
import { upsertCoreProject, upsertCoreWorkItem } from '../build/server/core/model/index.js';

const choice = { question: 'Which release?', options: [{ id: 'small', label: 'Small release' }] };
test('only unresolved choices in the latest completed assistant turn count as waiting', () => {
  const channel = { messages: [message('owner', 'user', 'Help'), message('answer', 'agent', 'Done')] };
  assert.equal(hasUnresolvedCatlasChoice(channel), false);
  channel.messages[1].choices = [choice];
  assert.equal(hasUnresolvedCatlasChoice(channel), true);
  channel.messages.push(message('system', 'system', 'Status update'));
  assert.equal(hasUnresolvedCatlasChoice(channel), true);
  channel.messages.push(message('free-reply', 'user', 'Do the small one'));
  assert.equal(hasUnresolvedCatlasChoice(channel), false);
  channel.messages.pop();
  channel.messages.push(message('new-answer', 'agent', 'All done'));
  assert.equal(hasUnresolvedCatlasChoice(channel), false);
  channel.messages.pop();
  channel.messages.push(message('response', 'system', '', { choiceResponse: { sourceMessageId: 'answer', status: 'submitted' } }));
  assert.equal(hasUnresolvedCatlasChoice(channel), false);
  channel.messages.pop();
  channel.messages[1].metadata = { assistantTurnId: 'choice-turn', terminal: false };
  assert.equal(hasUnresolvedCatlasChoice(channel), false);
  channel.messages.push(message('terminal', 'agent', 'Please choose', { metadata: { assistantTurnId: 'choice-turn', terminal: true } }));
  assert.equal(hasUnresolvedCatlasChoice(channel), true);
});

test('snapshot is bounded and minimal, excludes private/archive/cooldown, and conservatively derives provenance', async t => {
  const f = await catlasFixture(t);
  let core = await f.store.readCore(), chat = await f.store.read();
  core = upsertCoreTask(core, { id: 'approval', title: 'Approve the roadmap', approval: { status: 'pending' } }, fixedNow).core;
  core = upsertCoreTask(core, { id: 'derived', title: 'Derived external task', approval: { status: 'pending' } }, fixedNow).core;
  core = upsertCoreWorkItem(core, { id: 'external-item', title: 'Imported issue', status: 'blocked', projectId: 'project-external', taskId: 'derived' }, fixedNow).core;
  core = upsertCoreProject(core, { id: 'unknown', title: 'Old origin', status: 'active' }, fixedNow).core;
  core.projects.find(item => item.id === 'unknown').metadata = {};
  for (let index = 0; index < 9; index++) core = upsertCoreProject(core, { id: `extra-${index}`, title: 'Extra', status: 'active' }, fixedNow).core;
  const channel = chat.channels.find(item => item.id === f.channelId);
  channel.messages[1].choices = [choice];
  const snapshot = buildCatlasSnapshot({ core, chat, now: fixedNow, locale: 'en', cooldownIds: new Set(['item-blocked']) });
  assert.equal(snapshot.activeProjects.length, 5);
  assert.equal(snapshot.awaitingReply.length, 1);
  assert.equal(snapshot.stalledWork.some(item => item.id === 'item-blocked'), false);
  const entries = catlasSnapshotEntries(snapshot);
  assert.equal(entries.find(item => item.id === 'project-external').external, true);
  assert.equal(entries.find(item => item.id === 'external-item').external, true);
  assert.equal(entries.find(item => item.id === 'derived').external, true);
  assert.equal(entries.find(item => item.id === 'unknown').external, true);
  assert.equal(entries.find(item => item.id === 'project-internal').external, false);
  assert.ok(!JSON.stringify(snapshot).includes('Start with the next release'));
  for (const entry of entries) assert.ok(Object.keys(entry).every(key => ['id', 'kind', 'title', 'status', 'surface', 'idleDays', 'external', 'repoPathSet'].includes(key)));
  assert.ok(catlasSnapshotEntries(internalCatlasSnapshot(snapshot)).every(item => !item.external));
  channel.channelKind = 'direct_message';
  assert.equal(buildCatlasSnapshot({ core, chat, now: fixedNow, locale: 'en' }).recentConversations.length, 0);
  channel.channelKind = 'chat_channel';
  core.conversations.find(item => item.sourceChannelId === channel.id).kind = 'external_transport';
  assert.equal(buildCatlasSnapshot({ core, chat, now: fixedNow, locale: 'en' }).recentConversations.length, 0);
});

test('external origin cannot be cleared by ordinary record updates or removal of a current binding', async t => {
  const f = await catlasFixture(t);
  let core = await f.store.readCore();
  core = upsertCoreProject(core, { id: 'project-external', title: 'Unlinked', metadata: { contentOrigin: 'internal' } }, fixedNow).core;
  assert.equal(core.projects.find(item => item.id === 'project-external').metadata.contentOrigin, 'external');
  core = upsertCoreTask(core, { id: 'new-local', title: 'Local task' }, fixedNow).core;
  assert.equal(core.tasks.find(item => item.id === 'new-local').metadata.contentOrigin, 'internal');
});

test('catalog validation rejects a whole bad unit, protects builtin and owner IDs, and assigns new IDs on the host', () => {
  const catalog = createBuiltinGuideCatCatalog('chat:new');
  const first = catalog.greetings[0].id;
  for (const operations of [
    [{ op: 'remove', kind: 'greeting', id: first }],
    catalog.greetings.map(item => ({ op: 'disable', kind: 'greeting', id: item.id })),
    [{ op: 'disable', kind: 'greeting', id: 'owner:protected' }],
    [{ op: 'add', kind: 'chip', id: 'model-chosen', label: 'label', prompt: 'prompt', surface: 'chat', locale: 'en' }],
    [{ op: 'add', kind: 'greeting', text: 'x'.repeat(61), locale: 'en' }],
    [...Array(11)].map(() => ({ op: 'add', kind: 'greeting', text: 'More', locale: 'en' })),
    [{ op: 'disable', kind: 'greeting', id: first }, { op: 'nonsense', kind: 'greeting', id: first }],
  ]) {
    assert.throws(() => applyCatlasCatalogOperations(catalog, operations, 'en', false));
    assert.equal(catalog.greetings[0].enabled, true, 'failed validation never mutates the original');
  }
  const added = applyCatlasCatalogOperations(catalog, [{ op: 'add', kind: 'greeting', text: 'Fresh line', locale: 'en' }], 'en', false);
  assert.match(added.catalog.greetings.at(-1).id, /^catlas:/);
  assert.equal(applyCatlasCatalogOperations(added.catalog, [{ op: 'remove', kind: 'greeting', id: added.catalog.greetings.at(-1).id }], 'en', false).catalog.greetings.length, catalog.greetings.length);
});

test('navigation output permits only valid target IDs, never model text even with internal basis', () => {
  const entry = { id: 'internal', kind: 'project', title: 'Roadmap', surface: 'work', status: 'active', external: false, idleDays: 1 };
  const snapshot = { pendingApprovals: [], stalledWork: [], awaitingReply: [], activeProjects: [entry], recentConversations: [], context: {} };
  const open = { action: 'open', target: { kind: 'project', id: 'internal' }, basis: ['internal'] };
  const prefill = { action: 'prefill', surface: 'work', label: 'Roadmap', prompt: 'Plan Roadmap', basis: ['internal'] };
  for (const invalid of [{ ...open, label: 'laundered' }, prefill, { ...open, basis: [] }, { ...open, basis: ['unknown'] },
    { ...open, target: { kind: 'conversation', id: 'internal' } }, { ...open, target: { kind: 'project', id: 'missing' } }]) {
    assert.throws(() => validateCatlasRecommendations([invalid], 'refresh_navigation', snapshot, false));
  }
  assert.equal(validateCatlasRecommendations([open, open], 'refresh_navigation', snapshot, false).length, 1);
  assert.throws(() => validateCatlasRecommendations([open], 'refresh_prompt', snapshot, false));
  entry.external = true;
  assert.throws(() => validateCatlasRecommendations([prefill], 'refresh_prompt', snapshot, false));
  assert.throws(() => validateCatlasTitle({ title: 'Valid', authority: 'admin' }));
});
