import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { DatabaseChatStore } from '../build/server/products/chat/state/databaseStore.js';
import { databasePath } from '../build/server/products/chat/state/database/profileFormat.js';
import { archiveDirectory } from '../build/server/products/chat/state/database/archiveAssets.js';
import { openStateDatabase } from '../build/server/platform/persistence/state-db/stateDatabase.js';
import { ConversationProposalKindRegistry } from '../build/server/platform/proposals/contracts.js';
import { createConversationProposalService } from '../build/server/products/chat/api/conversationProposals.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';
import { snapshot } from './fixtures/desktop-state-snapshot.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-proposal 原子 ')), file = path.join(root, 'profile.json');
  const source = snapshot(), stores = [], clock = { now: new Date() }; let checkpoint;
  await writeFile(file, JSON.stringify(source));
  const create = () => { const store = new DatabaseChatStore(file, { checkpoint: phase => checkpoint?.(phase) }); stores.push(store); return store; };
  t.after(async () => { for (const store of stores) await store.close(); await rm(root, { recursive: true, force: true, maxRetries: 10 }); });
  const store = create(); await store.initialize();
  const world = { effects: [], count: 0, perform: async () => {} }, kinds = new ConversationProposalKindRegistry();
  kinds.register({ kind: 'trial.atomic', level: 'chat', validate: content => ({ text: String(content.text) }),
    binding: (_content, context) => ({ count: context.otherConversationsInProject('project-trial'), project: context.workProjectId }),
    describe: (_content, context) => ({ title: 'Trial', fields: [], records: [], folderWarning: {
      folder: 'synthetic', otherConversations: context.otherConversationsInProject('project-trial'), workItems: 0 } }),
    async perform(content, context, actors) { world.effects.push({ content, actors }); await world.perform(context); return { summary: 'Trial completed' }; },
  });
  const service = (backing = store) => createConversationProposalService({ chatStore: backing, kinds,
    mutationGate: createAsyncKeyedGate(), now: () => clock.now });
  const [id, other] = source.chat.channels.map(channel => channel.id), svc = service();
  const propose = text => svc.propose({ channelId: id, conversationId: 'ignored-by-server', kind: 'trial.atomic',
    content: { text }, proposerParticipantId: null });
  const noGlobal = backing => { backing.read = backing.updateSnapshot = async () => { throw Error('Proposal used global history'); }; };
  return { root, file, source, store, create, service, svc, propose, id, other, world, clock, noGlobal,
    setCheckpoint(value) { checkpoint = value; } };
}

test('proposal card writes preserve complete Project counts without reading damaged sibling history', async t => {
  const f = await fixture(t);
  await f.store.updateChannel(f.other, channel => ({ channel: { ...channel, workProjectId: 'project-trial' } }));
  const archived = await f.store.archiveConversation(f.other, 'archive'), assets = archiveDirectory(databasePath(f.file));
  const manifest = JSON.parse(await readFile(path.join(assets, `${archived.archiveId}.manifest.json`), 'utf8'));
  await writeFile(path.join(assets, manifest.file), 'damaged unrelated cold evidence');
  f.noGlobal(f.store);
  const { proposalId } = await f.propose('Private proposal value'); assert.ok(proposalId);
  const details = await f.svc.read(f.id, proposalId);
  assert.equal(details.view.folderWarning.otherConversations, 1);
  assert.equal(details.record.content.text, 'Private proposal value');
  assert.equal((await f.svc.decide(f.id, proposalId, 'confirm', 'owner-trial')).status, 'confirmed');
  assert.equal(f.world.effects.length, 1);
  assert.equal((await f.svc.read(f.id, proposalId)).record.status, 'confirmed');
});

test('two independent proposal services claim once and block archive through the actual perform', async t => {
  const f = await fixture(t), { proposalId } = await f.propose('Perform once');
  const second = f.create(); await second.initialize(); f.noGlobal(f.store); f.noGlobal(second);
  let unblock, entered, openBarrier, arrivals = 0;
  const started = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { unblock = resolve; });
  const barrier = new Promise(resolve => { openBarrier = resolve; });
  f.world.perform = async () => { entered(); await blocked; };
  for (const backing of [f.store, second]) {
    const update = backing.updateChannels.bind(backing);
    backing.updateChannels = async (...args) => {
      if (arrivals < 2) { arrivals++; if (arrivals === 2) openBarrier(); await barrier; }
      return update(...args);
    };
  }
  const decisions = [f.svc.decide(f.id, proposalId, 'confirm', 'owner-a'), f.service(second).decide(f.id, proposalId, 'confirm', 'owner-b')];
  let timer;
  try {
    await started;
    const loser = await Promise.race([...decisions, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('No losing claim returned')), 15_000); })]);
    assert.equal(loser.status, 'confirming'); assert.equal(f.world.effects.length, 1);
    await assert.rejects(second.archiveConversation(f.id, 'archive'), { code: 'archive_active' });
  } finally { clearTimeout(timer); unblock(); await Promise.allSettled(decisions); }
  const results = await Promise.all(decisions);
  assert.deepEqual(results.map(result => result.status).sort(), ['confirmed', 'confirming']);
  assert.equal(f.world.effects.length, 1);
  await second.archiveConversation(f.id, 'archive');
});

test('a durable confirming interruption never performs or replays and retires its live guard', async t => {
  const f = await fixture(t), { proposalId } = await f.propose('Do not replay');
  let armed = true;
  f.setCheckpoint(phase => { if (armed && phase === 'database_committed') { armed = false; throw Error('Claim publication interrupted'); } });
  f.noGlobal(f.store);
  await assert.rejects(f.svc.decide(f.id, proposalId, 'confirm', 'owner'), /Claim publication interrupted/);
  assert.equal(f.world.effects.length, 0);
  assert.equal((await f.svc.decide(f.id, proposalId, 'confirm', 'owner')).status, 'confirming');
  assert.equal(f.world.effects.length, 0);
  assert.equal((await readdir(`${f.file}.leases`)).filter(name => name.endsWith('.json')).length, 1);
  await f.store.archiveConversation(f.id, 'archive');
});

test('three catalog drifts never publish a claim or perform and leave the proposal open', async t => {
  const f = await fixture(t), { proposalId } = await f.propose('Retry current context');
  const update = f.store.updateChannels.bind(f.store); let attempts = 0;
  f.store.updateChannels = async (...args) => {
    await f.store.updateChannel(f.other, channel => ({ channel: { ...channel, title: `Context drift ${++attempts}` } }));
    return update(...args);
  };
  f.noGlobal(f.store);
  await assert.rejects(f.svc.decide(f.id, proposalId, 'confirm', 'owner'), { code: 'conversation_changed' });
  assert.equal(attempts, 3); assert.equal(f.world.effects.length, 0);
  assert.equal((await f.svc.read(f.id, proposalId)).record.status, 'open');
  assert.equal((await readdir(`${f.file}.leases`)).filter(name => name.endsWith('.json')).length, 1);
});

test('cold proposal details use bounded native pages while mutations refuse before decoding evidence', async t => {
  const f = await fixture(t), { proposalId } = await f.propose('Retained private cold card');
  await f.store.updateChannel(f.id, channel => {
    for (let index = 0; index < 401; index++) channel.messages.push({ ...structuredClone(channel.messages[0]),
      id: randomUUID(), body: `Later synthetic message ${index}`, metadata: {} });
    return { channel };
  });
  await f.store.archiveConversation(f.id, 'archive'); f.noGlobal(f.store);
  f.store.readChannelState = async () => { throw Error('Cold card was fully hydrated'); };
  const page = f.store.readMessagePage.bind(f.store); let pages = 0;
  f.store.readMessagePage = async (...args) => { const result = await page(...args); assert.ok(result.messages.length <= 200); pages++; return result; };
  assert.equal((await f.svc.read(f.id, proposalId)).record.content.text, 'Retained private cold card');
  assert.ok(pages > 1);
  f.store.readMessagePage = async () => { throw Error('A cold mutation tried to read evidence'); };
  assert.equal((await f.propose('Refused')).refusal, 'conversation_archived');
  for (const decision of ['confirm', 'decline']) await assert.rejects(f.svc.decide(f.id, proposalId, decision, 'owner'), { code: 'conversation_archived' });
  assert.equal(f.world.effects.length, 0);
});

test('an adapter without catalog retains full Project counts in readonly details', async t => {
  const f = await fixture(t);
  await f.store.updateChannel(f.other, channel => ({ channel: { ...channel, workProjectId: 'project-trial' } }));
  f.store.readCatalog = undefined;
  const { proposalId } = await f.propose('Full fallback context');
  assert.equal((await f.svc.read(f.id, proposalId)).view.folderWarning.otherConversations, 1);
});
