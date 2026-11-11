import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import {
  ConversationProposalKindRegistry,
  ConversationProposalRefusal,
  CONVERSATION_PROPOSAL_TTL_MS,
} from '../build/server/platform/proposals/contracts.js';
import { createConversationProposalService } from '../build/server/products/chat/api/conversationProposals.js';
import { createAsyncKeyedGate } from '../build/server/products/chat/shared/asyncControl.js';
import { buildBossCatBoard } from '../build/server/products/chat/state/bossCatBoard.js';
import {
  isConversationProposalCard,
  listConversationProposals,
  markProposalOutcomesReported,
  pendingProposalOutcomes,
} from '../build/server/products/chat/state/conversationProposals.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { assignCatToChannel, createCat, createChannel } from '../build/server/products/chat/state/model/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { isBossCatJoinRequestMessage, withoutBossCatJoinRequests, withoutOwnerStarted } from '../build/server/products/chat/shared/ownerStarted.js';
import { buildChannelView } from '../build/server/products/chat/state/model/readModels.js';
import { createAuthenticatedTestSession, createTestAuthConfig } from './testUtils.js';

const NOW = new Date('2026-11-12T08:00:00.000Z');

/** A trial kind that writes nothing outside the test (PLAN-135 Phase 3). */
function trialKind(world) {
  return {
    kind: 'trial.note',
    level: 'chat',
    validate(content) {
      const text = content && typeof content === 'object' ? content.text : null;
      if (typeof text !== 'string' || !text.trim()) throw new ConversationProposalRefusal('text_required', 'text is required.');
      return { text: text.trim().slice(0, 200) };
    },
    // The record it touches: a counter the test can change to make the card out of date.
    binding: () => ({ revision: world.revision }),
    describe: (content) => ({ title: 'Trial note', fields: [{ name: 'text', value: content.text }],
      records: [{ kind: 'other', id: 'trial', title: 'Trial' }], folderWarning: null }),
    async perform(content, _context, actors) {
      await world.onPerform?.();
      if (world.failNext) { world.failNext = false; throw new ConversationProposalRefusal('trial_refused', 'no'); }
      world.writes.push({ content, actors });
      return { summary: 'written' };
    },
  };
}

function seedState() {
  let state = createDefaultChatState();
  state = createCat(state, { name: 'Kiki', provider: 'codex' }, NOW);
  state = createCat(state, { name: 'Momo', provider: 'codex' }, NOW);
  const catId = state.cats.find((cat) => cat.name === 'Kiki').id;
  const momoId = state.cats.find((cat) => cat.name === 'Momo').id;
  state = createChannel(state, { title: 'Plans', topic: 'Planning', originSurface: 'chat' }, NOW);
  const channelId = state.selectedChannelId;
  // Two Cats make it a group conversation, which the Boss Cat board counts.
  state = assignCatToChannel(state, channelId, { catId, provider: 'codex' }, NOW);
  state = assignCatToChannel(state, channelId, { catId: momoId, provider: 'codex' }, NOW);
  const participantId = state.channels.find((channel) => channel.id === channelId).catAssignments
    .find((assignment) => assignment.catId === catId).participantId;
  return { state, catId, channelId, participantId };
}

function service(world, store, clock) {
  const kinds = new ConversationProposalKindRegistry();
  kinds.register(trialKind(world));
  return createConversationProposalService({ chatStore: store, mutationGate: createAsyncKeyedGate(), kinds, now: () => clock.now });
}

function setup() {
  const seed = seedState();
  const store = new MemoryChatStore(seed.state);
  const world = { revision: 1, writes: [], failNext: false };
  const clock = { now: NOW };
  const svc = service(world, store, clock);
  const propose = (text, extra = {}) => svc.propose({ channelId: seed.channelId, conversationId: `conversation-channel-${seed.channelId}`,
    kind: 'trial.note', content: { text }, proposerParticipantId: seed.participantId, ...extra });
  return { ...seed, store, world, clock, svc, propose };
}

test('FR-14, FR-15: a proposal is validated, stored as its card, and writes nothing', async () => {
  const h = setup();
  const proposed = await h.propose('  Remember the launch date  ');
  assert.ok(proposed.proposalId, JSON.stringify(proposed));
  const state = await h.store.read();
  const [record] = listConversationProposals(state, h.channelId);
  assert.equal(record.status, 'open');
  assert.deepEqual(record.content, { text: 'Remember the launch date' });
  assert.equal(record.proposerParticipantId, h.participantId);
  assert.equal(record.expiresAt, new Date(NOW.getTime() + CONVERSATION_PROPOSAL_TTL_MS).toISOString());
  const card = state.channels.find((channel) => channel.id === h.channelId).messages.at(-1);
  assert.equal(isConversationProposalCard(card), true);
  assert.equal(card.metadata.origin, 'system', 'no transport mirror');
  assert.doesNotMatch(card.body, /launch date/u, "the card's text carries no content");
  // Kept out of a model's context, as the owner's join card is.
  assert.equal(isBossCatJoinRequestMessage(card), true);
  assert.equal(withoutBossCatJoinRequests([card]).length, 0);
  // Only a system message is a card, and a client cannot supply the key on its message.
  assert.equal(isBossCatJoinRequestMessage({ ...card, senderKind: 'user' }), false);
  assert.equal('conversationProposal' in withoutOwnerStarted({ conversationProposal: { id: 'forged' }, kept: 1 }), false);
  // A client sees the card's id and status, not its content.
  const viewed = buildChannelView(state, h.channelId).messages.at(-1);
  assert.deepEqual(viewed.metadata.conversationProposal, { id: proposed.proposalId, status: 'open' });
  assert.equal(listConversationProposals(state, h.channelId)[0].content.text, 'Remember the launch date', 'the store keeps it');
  assert.deepEqual(h.world.writes, []);

  assert.equal((await h.propose('')).refusal, 'text_required');
  assert.equal((await h.propose('x', { kind: 'missing' })).refusal, 'unknown_proposal_kind');
});

test('FR-20: at most 3 open proposals, and 10 an hour', async () => {
  const h = setup();
  const declineOpen = async () => {
    for (const record of listConversationProposals(await h.store.read(), h.channelId).filter((entry) => entry.status === 'open')) {
      await h.svc.decide(h.channelId, record.id, 'decline', 'owner-actor');
    }
  };
  for (const text of ['a', 'b', 'c']) assert.ok((await h.propose(text)).proposalId);
  assert.equal((await h.propose('d')).refusal, 'proposal_limit');
  // Closing frees a place; the hourly count still holds every one created.
  for (const batch of [['e', 'f', 'g'], ['h', 'i', 'j']]) {
    await declineOpen();
    for (const text of batch) assert.ok((await h.propose(text)).proposalId, text);
  }
  await declineOpen();
  assert.ok((await h.propose('tenth')).proposalId);
  await declineOpen();
  assert.equal((await h.propose('eleventh')).refusal, 'proposal_rate_limited');
  h.clock.now = new Date(NOW.getTime() + 61 * 60_000);
  assert.ok((await h.propose('next hour')).proposalId);
});

test('FR-17 to FR-19: only a confirmation performs the bound write, once, with both actors', async () => {
  const h = setup();
  const { proposalId } = await h.propose('Ship it');
  const declined = await h.propose('Not this');
  assert.deepEqual(await h.svc.decide(h.channelId, declined.proposalId, 'decline', 'owner-actor'), { status: 'declined', refusal: null });
  assert.deepEqual(h.world.writes, []);

  h.world.onPerform = async () => {
    const during = listConversationProposals(await h.store.read(), h.channelId).find((entry) => entry.id === proposalId);
    h.world.statusDuringPerform = during.status;
  };
  const confirmed = await h.svc.decide(h.channelId, proposalId, 'confirm', 'owner-actor');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(h.world.statusDuringPerform, 'confirming', 'marked before the write, so a crash never writes twice');
  assert.equal(listConversationProposals(await h.store.read(), h.channelId).find((entry) => entry.id === proposalId).status, 'confirmed');
  assert.deepEqual(h.world.writes, [{ content: { text: 'Ship it' },
    actors: { proposerParticipantId: h.participantId, ownerActorId: 'owner-actor' } }]);
  // Closed once.
  assert.deepEqual(await h.svc.decide(h.channelId, proposalId, 'confirm', 'owner-actor'), { status: 'confirmed', refusal: 'card_closed' });
  assert.equal(h.world.writes.length, 1);
  assert.deepEqual(await h.svc.decide(h.channelId, 'nope', 'confirm', 'owner-actor'), { status: 'not_found' });
});

test('FR-18: a stale whole-state write cannot reopen a card or drop one posted meanwhile', async () => {
  const h = setup();
  const { proposalId } = await h.propose('Write once');
  // A continuation replay read the state here, and writes its copy back later.
  const stale = await h.store.read();
  await h.svc.decide(h.channelId, proposalId, 'confirm', 'owner-actor');
  const posted = await h.propose('Posted meanwhile');
  await h.store.write(stale);
  const after = listConversationProposals(await h.store.read(), h.channelId);
  assert.equal(after.find((entry) => entry.id === proposalId).status, 'confirmed', 'not reopened');
  assert.ok(after.some((entry) => entry.id === posted.proposalId), 'not dropped');
  assert.deepEqual(await h.svc.decide(h.channelId, proposalId, 'confirm', 'owner-actor'), { status: 'confirmed', refusal: 'card_closed' });
  assert.equal(h.world.writes.length, 1, 'written once');
});

test('FR-18: a changed record makes the card out of date, and 24 hours expire it', async () => {
  const h = setup();
  const stale = await h.propose('Bound to revision 1');
  h.world.revision = 2;
  const details = await h.svc.read(h.channelId, stale.proposalId);
  assert.equal(details.outOfDate, true);
  assert.deepEqual(await h.svc.decide(h.channelId, stale.proposalId, 'confirm', 'owner-actor'), { status: 'stale', refusal: 'card_stale' });

  const late = await h.propose('Too late');
  h.clock.now = new Date(NOW.getTime() + CONVERSATION_PROPOSAL_TTL_MS + 1);
  assert.equal((await h.svc.read(h.channelId, late.proposalId)).status, 'expired');
  assert.deepEqual(await h.svc.decide(h.channelId, late.proposalId, 'confirm', 'owner-actor'), { status: 'expired', refusal: 'card_expired' });
  assert.equal(listConversationProposals(await h.store.read(), h.channelId).find((entry) => entry.id === late.proposalId).status, 'expired');

  h.clock.now = NOW;
  const failing = await h.propose('Refused by the write');
  h.world.failNext = true;
  assert.deepEqual(await h.svc.decide(h.channelId, failing.proposalId, 'confirm', 'owner-actor'), { status: 'failed', refusal: 'trial_refused' });
  assert.deepEqual(h.world.writes, []);
});

test('FR-21: the proposer learns each outcome once, in its next turn', async () => {
  const h = setup();
  const a = await h.propose('First');
  const b = await h.propose('Second');
  await h.propose('Still open');
  await h.svc.decide(h.channelId, a.proposalId, 'confirm', 'owner-actor');
  await h.svc.decide(h.channelId, b.proposalId, 'decline', 'owner-actor');
  let state = await h.store.read();
  assert.deepEqual(pendingProposalOutcomes(state, h.channelId, 'someone-else', NOW).lines, []);
  const pending = pendingProposalOutcomes(state, h.channelId, h.participantId, NOW);
  assert.equal(pending.lines.length, 2);
  assert.match(pending.lines.join('\n'), new RegExp(`${a.proposalId} \\(trial\\.note\\) was confirmed`, 'u'));
  assert.match(pending.lines.join('\n'), /declined by the owner/u);
  assert.doesNotMatch(pending.lines.join('\n'), /First|Second/u, 'ids and kinds only');
  state = markProposalOutcomesReported(state, h.channelId, pending.proposalIds, NOW);
  assert.deepEqual(pendingProposalOutcomes(state, h.channelId, h.participantId, NOW).lines, []);
  // An expiry is told too, and stored when it is.
  const later = new Date(NOW.getTime() + CONVERSATION_PROPOSAL_TTL_MS + 1);
  const expired = pendingProposalOutcomes(state, h.channelId, h.participantId, later);
  assert.match(expired.lines[0], /expired unanswered/u);
  state = markProposalOutcomesReported(state, h.channelId, expired.proposalIds, later);
  assert.equal(listConversationProposals(state, h.channelId).find((entry) => entry.content.text === 'Still open').status, 'expired');
});

test("the Boss Cat board counts a Cat's open proposals as waiting, and not a closed or expired one", async () => {
  const h = setup();
  const state = await h.store.read();
  const withBoss = createCat(state, { name: 'Boss', provider: 'claude', group: 'admin' }, NOW);
  const bossCatId = withBoss.cats.find((cat) => cat.name === 'Boss').id;
  await h.store.write(withBoss);
  const { proposalId } = await h.propose('Waiting');
  const board = async (now) => buildBossCatBoard({ state: await h.store.read(), bossCatId, now })
    .cats.find((cat) => cat.catId === h.catId)?.waitingApprovals;
  assert.equal(await board(NOW), 1);
  assert.equal(await board(new Date(NOW.getTime() + CONVERSATION_PROPOSAL_TTL_MS + 1)), 0, 'an expired card no longer waits');
  await h.svc.decide(h.channelId, proposalId, 'decline', 'owner-actor');
  assert.equal(await board(NOW), 0);
});

test('the card routes answer the owner only, and the decision is the owner principal\'s', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-proposals-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'state'), { recursive: true });
  const authConfig = createTestAuthConfig();
  const auth = await createAuthenticatedTestSession({ now: new Date(), sessionSecret: authConfig.sessionSecret, sessionTtlMs: authConfig.sessionTtlMs });
  const seed = seedState();
  const chatStore = new MemoryChatStore(seed.state);
  const world = { revision: 1, writes: [], failNext: false };
  const proposalKinds = new ConversationProposalKindRegistry();
  proposalKinds.register(trialKind(world));
  const server = createServer({
    shared: { config: { host: '127.0.0.1', port: 0, runtimeBaseUrl: 'http://127.0.0.1:3110', runtimeApiKey: '',
      platformDir: dir, chatStatePath: path.join(dir, 'state', 'chat-state.local.json'), runtimeDataDir: path.join(dir, 'runtime'),
      auth: authConfig }, authStore: auth.authStore, runtimeClient: { async getHealth() { return { reachable: true, status: 'ok' }; } } },
    chat: { chatStore, proposalKinds },
  });
  await server.startupRecovery;
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.close(); await once(server, 'close'); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'content-type': 'application/json', origin: 'http://127.0.0.1:8181', cookie: auth.cookie, 'x-cats-csrf-token': auth.csrfToken };
  // A tool proposes through the same service the routes answer.
  const svc = createConversationProposalService({ chatStore, mutationGate: createAsyncKeyedGate(), kinds: proposalKinds });
  const { proposalId } = await svc.propose({ channelId: seed.channelId, conversationId: `conversation-channel-${seed.channelId}`,
    kind: 'trial.note', content: { text: 'From a tool' }, proposerParticipantId: seed.participantId });
  const url = `${base}/api/channels/${seed.channelId}/proposals/${proposalId}`;

  const read = await fetch(url, { headers });
  assert.equal(read.status, 200);
  const { proposal } = await read.json();
  assert.equal(proposal.status, 'open');
  assert.equal(proposal.proposer.name, 'Kiki');
  assert.deepEqual(proposal.view.fields, [{ name: 'text', value: 'From a tool' }]);
  assert.equal((await fetch(`${base}/api/channels/${seed.channelId}/proposals/missing`, { headers })).status, 404);
  assert.equal((await fetch(`${url}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'maybe' }) })).status, 400);
  assert.equal((await fetch(`${url}/decision`, { method: 'POST', headers: { ...headers, 'x-cats-csrf-token': 'wrong' },
    body: JSON.stringify({ decision: 'confirm' }) })).status, 403, 'CSRF');

  const authState = await auth.authStore.readState();
  authState.memberships[0].roles = ['member'];
  await auth.authStore.writeState(authState);
  assert.equal((await fetch(url, { headers })).status, 403);
  assert.equal((await fetch(`${url}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'confirm' }) })).status, 403);
  assert.deepEqual(world.writes, [], 'a member cannot confirm');
  authState.memberships[0].roles = ['owner'];
  await auth.authStore.writeState(authState);

  const decided = await fetch(`${url}/decision`, { method: 'POST', headers, body: JSON.stringify({ decision: 'confirm' }) });
  assert.equal(decided.status, 200);
  assert.equal((await decided.json()).outcome.status, 'confirmed');
  assert.equal(world.writes.length, 1);
  assert.equal(world.writes[0].actors.proposerParticipantId, seed.participantId);
  assert.ok(world.writes[0].actors.ownerActorId, 'the confirming owner is recorded');
});
