import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createCatActorId } from '../build/server/core/actors.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel, setChannelCatLease, setChannelStatus } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { createChatCatImages, routeCatImages } from '../build/server/products/chat/api/catImages.js';
import { readCatImageAttachment, catImageAttachmentUrl } from '../build/server/shared/catImageAttachments.js';
import { createTelegramRelay } from '../build/server/platform/transports/telegram/relay/index.js';
import { checkTelegramDispatchGuard } from '../build/server/platform/transports/telegram/delivery.js';
import { InMemoryTelegramRelayStore } from '../build/server/platform/transports/telegram/store/index.js';
import { createTelegramConversationMapper } from '../build/server/platform/transports/telegram/mapping.js';
import { RUNTIME_SUPERVISION_BOUNDARY } from '../build/server/platform/supervision/runtimeBoundary.js';

const NOW = new Date('2026-10-23T08:00:00Z');
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const capabilities = { schemaVersion: 2, sourceSessionYield: true, revision: 'r1', maxPromptLength: 2000, maxImageBytes: 8388608,
  targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }],
  profiles: [{ id: 'grok-generate', revision: 1, operation: 'image.generate', targetIds: ['grok/native'],
    agentConfigs: [{ id: 'grok-agent', model: 'grok-test', effort: 'xhigh' }], inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: ['1:1'] } }] };

async function fixture(t, outcomes = ['sent']) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-chat-controlled-images-'));
  let clock = NOW;
  let state = createCat(createDefaultChatState(), { name: 'Ordinary cat', provider: 'grok', group: 'standard' }, NOW);
  const catId = state.cats.find(row => row.name === 'Ordinary cat').id;
  state = createChannel(state, { title: 'Cat DM', topic: '', roomMode: 'direct_message', originSurface: 'chat',
    defaultRecipientId: catId, participantCatIds: [catId] }, NOW);
  const laneId = state.selectedChannelId;
  state = setChannelStatus(state, laneId, 'active', NOW);
  state = setChannelCatLease(state, laneId, catId, { status: 'ready', sessionId: 'source-chat' }, NOW);
  const binding = { id: 'cat-bot', platform: 'telegram', botName: 'ordinary_bot', orchestratorActorId: 'actor-orchestrator-global',
    catActorId: createCatActorId(catId), bossCatActorId: null, botToken: 'fixture-token', webhookSecret: null,
    inboundMode: 'polling', roomMode: 'direct_message', status: 'active', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const store = new MemoryChatStore(); await store.writeSnapshot(state, { ...createDefaultCoreState(NOW), botBindings: [binding] });
  const relayStore = new InMemoryTelegramRelayStore();
  const mapped = createTelegramConversationMapper(relayStore).resolveChatConversation({ chatId: '12345', bindingId: binding.id,
    acceptedAt: NOW.toISOString(), chatType: 'private', chatTitle: null, chatUsername: null, messageId: '1', messageSummary: null });
  const sends = []; let posted = 0;
  let mediaReadGate; let mediaReadEntered = false;
  const relay = createTelegramRelay({ store: relayStore, now: () => clock, deliveryClient: { async deliver(request, guard) {
    mediaReadEntered = true; await mediaReadGate; await checkTelegramDispatchGuard(guard?.assertAllowed);
    sends.push(request); const outcome = outcomes[Math.min(sends.length - 1, outcomes.length - 1)];
    if (outcome === 'throw') throw new Error('socket acknowledgement lost');
    return { ok: outcome === 'sent', chatId: request.chatId, messageId: outcome === 'sent' ? 'telegram-42' : null,
      failureKind: outcome === 'retryable' ? 'retryable' : outcome === 'failed' ? 'rejected' : 'uncertain', retryAfterSeconds: 10 };
  } } });
  relay.linkRoom({ conversationId: mapped.binding.conversationId, roomId: laneId });
  const remote = new Map();
  let sourceBusy = true; let hostTurnActive = true;
  const runtimeClient = { async observeSession() { return { session: { status: 'ready', turnInFlight: sourceBusy } }; },
    async getImageCapabilities() { return capabilities; }, async submitImageJob(input) {
    posted++; const job = { ...input, schemaVersion: 2, provider: 'grok', instance: 'native', agentModel: 'grok-test', agentEffort: 'xhigh',
      status: 'succeeded', createdAt: clock.toISOString(), updatedAt: clock.toISOString(), error: null, warnings: [], executionOutcome: 'completed',
      output: { mimeType: 'image/jpeg', bytes: bytes.length, width: 1, height: 1, transparency: 'opaque', sha256: createHash('sha256').update(bytes).digest('hex') } };
    remote.set(input.id, job); return job;
  }, async getImageJob(id) { return remote.get(id); }, async getImageBytes() { return bytes; } };
  let appendGate;
  let accountActive = true;
  const dependencies = { chatStore: store, runtimeClient, config: { platformDir: root },
    mutationGate: { run: async (_key, operation) => { await appendGate; return operation(); } }, telegramRelay: relay, now: () => clock,
    isTurnActive: () => hostTurnActive,
    authStore: { async readStateStatus() { return { status: 'ready', state: {
      accounts: [{ id: 'account-owner', status: accountActive ? 'active' : 'disabled' }],
      memberships: [{ accountId: 'account-owner', roles: ['owner'] }],
    } }; } } };
  let service = createChatCatImages(dependencies);
  t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  const input = { revision: 0, enabled: true, manual: true, proactive: true, targetId: 'grok/native', profileId: 'grok-generate',
    profileRevision: '1', agentConfigId: 'grok-agent', dailyLimit: 2, totalLimit: 4, minIntervalMinutes: 1, timeZone: 'UTC',
    windowStart: '00:00', windowEnd: '00:00', expiresAt: '2026-11-01T00:00:00Z', bindingId: binding.id };
  const owner = (await store.readCore()).ownerProfile.actorId;
  const turn = { context: { metadata: { supervisionBoundary: RUNTIME_SUPERVISION_BOUNDARY, supervisionProduct: 'cats-chat',
    supervisionSurface: 'companion-heartbeat', supervisionToolName: 'cats.runtime.message.send',
    supervisionRunId: laneId, supervisionActionId: 'heartbeat-one' } } };
  return { catId, laneId, binding, store, owner, input, turn, relay, relayStore, sends, posted: () => posted,
    holdAppend() { let release; appendGate = new Promise(resolve => { release = resolve; }); return release; },
    holdMediaRead() { let release; mediaReadGate = new Promise(resolve => { release = resolve; }); return release; },
    mediaReadEntered: () => mediaReadEntered,
    revokeAccount() { accountActive = false; },
    get service() { return service; }, advance(ms) { clock = new Date(clock.getTime() + ms); },
    setSourceBusy(value) { sourceBusy = value; }, setTurnActive(value) { hostTurnActive = value; },
    async restart() { await service.close(); service = createChatCatImages(dependencies); },
    async generate() {
      const resolved = await service.resolveTurn('source-chat', turn); assert.ok(resolved);
      const job = await service.service().submit(resolved.caller, { requestId: randomUUID(), prompt: 'A friendly morning cat', caption: '早安！' }, true);
      assert.equal(posted, 0); service.service().releaseTurn('source-chat');
      for (let n = 0; n < 200 && !(await service.status('account-owner', catId)).jobs.some(row => row.status === 'succeeded'); n++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return job;
    } };
}

test('ordinary Cat without an installed Studio queues once, appends one image message and gets a Telegram relay receipt', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.status('account-owner', f.catId)).policy, null);
  assert.equal(await f.service.resolveTurn('source-chat', f.turn), null);
  await f.service.save('account-owner', f.catId, f.input);
  const job = await f.generate(); await f.service.tick(); await f.service.tick();
  const status = await f.service.status('account-owner', f.catId);
  assert.equal(status.jobs[0].delivery.status, 'sent'); assert.equal(status.jobs[0].delivery.transportMessageId, 'telegram-42');
  assert.equal(f.posted(), 1); assert.equal(f.sends.length, 1); assert.equal(f.sends[0].operation, 'send_media');
  assert.equal(f.sends[0].caption, '早安！');
  const messages = (await f.store.read()).channels.find(row => row.id === f.laneId).messages.filter(row => row.metadata.catImageJobId === job.id);
  assert.equal(messages.length, 1); assert.equal(messages[0].metadata.transportDeliveryManaged, true);
  const attachment = readCatImageAttachment(messages[0].metadata);
  assert.equal(attachment.jobId, job.id); assert.equal(attachment.mimeType, 'image/jpeg');
  assert.equal(catImageAttachmentUrl(attachment), `/api/cats/${f.catId}/images/${job.id}/image`);
  assert.deepEqual((await f.service.image('account-owner', f.catId, job.id)).bytes, bytes);
  await assert.rejects(f.service.image('other-account', f.catId, job.id), /image_not_found/);
  await f.restart(); await f.service.tick(); assert.equal(f.sends.length, 1); assert.equal(f.posted(), 1);
});

test('an uncertain Telegram outcome persists through restart; explicit owner retry uses the same asset and message', async t => {
  const f = await fixture(t, ['throw', 'sent']); await f.service.save('account-owner', f.catId, f.input);
  const job = await f.generate(); await f.service.tick();
  assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'uncertain');
  await f.restart(); await f.service.tick(); assert.equal(f.sends.length, 1);
  await f.service.retry('account-owner', f.catId, job.id); await f.service.tick();
  assert.equal(f.sends.length, 2); assert.equal(f.sends[0].mediaFile.path, f.sends[1].mediaFile.path); assert.equal(f.posted(), 1);
  assert.equal((await f.store.read()).channels.find(row => row.id === f.laneId).messages.filter(row => row.metadata.catImageJobId === job.id).length, 1);
});

test('only definite transient rejection retries automatically, within its bounded backoff', async t => {
  const f = await fixture(t, ['retryable', 'retryable', 'retryable']); await f.service.save('account-owner', f.catId, f.input);
  await f.generate(); await f.service.tick(); await f.service.tick(); assert.equal(f.sends.length, 1);
  f.advance(11000); await f.service.tick(); f.advance(11000); await f.service.tick(); f.advance(11000); await f.service.tick();
  assert.equal(f.sends.length, 3); assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'failed');
  assert.equal(f.posted(), 1);
});

for (const revoke of ['sleep', 'binding', 'policy']) test('late send is suppressed after ' + revoke + ' changes', async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input); await f.generate();
  if (revoke === 'sleep') await f.store.write(setChannelStatus(await f.store.read(), f.laneId, 'watching', NOW));
  if (revoke === 'binding') f.relay.linkRoom({ roomId: 'different-lane', bindingId: f.binding.id, chatId: '12345' });
  if (revoke === 'policy') await f.service.save('account-owner', f.catId, { revision: 1, enabled: false });
  await f.service.tick(); assert.equal(f.sends.length, 0); assert.equal(f.posted(), 1);
  assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'suppressed');
});

test('routine ticks cannot dispatch held tool work; restart needs explicit proof of an idle source turn', async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input);
  const resolved = await f.service.resolveTurn('source-chat', f.turn);
  const job = await f.service.service().submit(resolved.caller, { requestId: randomUUID(), prompt: 'Morning cat', caption: 'Morning' }, true);
  f.setSourceBusy(false); // Registry can look ready while the host still owns its originating turn.
  await f.service.tick(); await f.service.tick(); assert.equal(f.posted(), 0);
  await f.restart(); f.setTurnActive(false); f.setSourceBusy(true);
  await f.service.tick(); assert.equal(f.posted(), 0);
  f.setSourceBusy(false); await f.service.tick();
  for (let n = 0; n < 100 && f.posted() === 0; n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.posted(), 1);
  assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].id, job.id);
});

test('graceful shutdown before delivery preserves the finished image for the next startup', async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input);
  await f.generate(); assert.equal(f.sends.length, 0); await f.restart();
  await f.service.tick(); await f.service.tick();
  assert.equal(f.sends.length, 1); assert.equal(f.posted(), 1);
  assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'sent');
});

test('shutdown drains an append already in progress without suppressing its delivery', async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input); await f.generate();
  const release = f.holdAppend(); const pending = f.service.tick();
  while ((await f.service.status('account-owner', f.catId)).jobs[0].delivery?.status !== 'sending') await new Promise(resolve => setTimeout(resolve, 1));
  const closing = f.service.close(); release(); await pending; await closing;
  await f.restart(); await f.service.tick();
  assert.equal(f.sends.length, 1); assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'sent');
});

test('partial policy edits preserve the owner-selected second binding and its grant revision', async t => {
  const f = await fixture(t); const core = await f.store.readCore();
  const binding = { ...f.binding, id: 'second-bot', botName: 'second_bot', botToken: 'second-token' };
  await f.store.writeSnapshot(await f.store.read(), { ...core, botBindings: [...core.botBindings, binding] });
  const mapped = createTelegramConversationMapper(f.relayStore).resolveChatConversation({ chatId: '23456', bindingId: binding.id,
    acceptedAt: NOW.toISOString(), chatType: 'private', chatTitle: null, chatUsername: null, messageId: '1', messageSummary: null });
  f.relay.linkRoom({ conversationId: mapped.binding.conversationId, roomId: f.laneId });
  const before = (await f.service.save('account-owner', f.catId, { ...f.input, bindingId: binding.id })).policy;
  const edited = (await f.service.save('account-owner', f.catId, { revision: 1, dailyLimit: 1 })).policy;
  assert.equal(edited.bindingId, binding.id); assert.equal(edited.bindingRevision, before.bindingRevision);
  const disabled = (await f.service.save('account-owner', f.catId, { revision: 2, enabled: false })).policy;
  assert.equal(disabled.bindingId, binding.id); assert.equal(disabled.bindingRevision, before.bindingRevision);
});

test('non-owner members cannot read or mutate image policies or request delivery retries', async () => {
  let calls = 0;
  for (const [method, path] of [['GET', 'image-policy'], ['PUT', 'image-policy'], ['POST', `images/${randomUUID()}/retry`]]) {
    let status;
    const handled = await routeCatImages({ url: new URL(`http://localhost/api/cats/cat-one/${path}`), method,
      auth: { principal: { account: { id: 'ordinary-member' }, membership: { roles: ['member'] } } },
      response: { writeHead(code) { status = code; }, end() {} },
      dependencies: { catImages: { status() { calls++; }, save() { calls++; }, retry() { calls++; } } } });
    assert.equal(handled, true); assert.equal(status, 403);
  }
  assert.equal(calls, 0);
});

for (const change of ['sleep', 'relink', 'token', 'account']) test('full delivery authorization is rechecked after asynchronous file reading: ' + change, async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input); await f.generate();
  const release = f.holdMediaRead(); const pending = f.service.tick();
  while (!f.mediaReadEntered()) await new Promise(resolve => setTimeout(resolve, 1));
  if (change === 'sleep') await f.store.write(setChannelStatus(await f.store.read(), f.laneId, 'watching', NOW));
  if (change === 'relink') f.relay.linkRoom({ roomId: 'another-lane', bindingId: f.binding.id, chatId: '12345' });
  if (change === 'token') {
    const core = await f.store.readCore(); await f.store.writeSnapshot(await f.store.read(),
      { ...core, botBindings: core.botBindings.map(binding => ({ ...binding, botToken: 'rotated-token' })) });
  }
  if (change === 'account') f.revokeAccount();
  release(); await pending;
  assert.equal(f.sends.length, 0); assert.equal(f.posted(), 1);
  assert.equal((await f.service.status('account-owner', f.catId)).jobs[0].delivery.status, 'suppressed');
});

test('a second account cannot lend a new policy to an active Cat, nor can a different runtime session gain the tool', async t => {
  const f = await fixture(t); await f.service.save('account-owner', f.catId, f.input);
  await assert.rejects(f.service.save('other-owner', f.catId, f.input), /image_owner_scope_conflict/);
  assert.equal(await f.service.resolveTurn('unrelated-session', f.turn), null);
  assert.equal(await f.service.resolveTurn('source-chat', { context: { metadata: { ...f.turn.context.metadata, supervisionBoundary: 'invented' } } }), null);
  await assert.rejects(f.service.save('account-owner', f.catId, { revision: 1, enabled: true, accountId: 'other-owner' }), /invalid_image_policy/);
});

test('owner can stop an uncertain delivery after relinking, preserve its unknown outcome and unblock reset', async t => {
  const f = await fixture(t, ['throw']); await f.service.save('account-owner', f.catId, f.input);
  const job = await f.generate(); await f.service.tick();
  f.relay.linkRoom({ roomId: 'different-lane', bindingId: f.binding.id, chatId: '12345' });
  await assert.rejects(f.service.retry('account-owner', f.catId, job.id), /image_not_authorized/);
  await assert.rejects(f.service.clearForReset(), /image_service_busy/);
  const stopped = await f.service.cancel('account-owner', f.catId, job.id);
  assert.equal(stopped.jobs[0].delivery.status, 'uncertain'); assert.ok(stopped.jobs[0].delivery.abandonedAt);
  assert.equal(stopped.jobs[0].delivery.error, 'delivery_abandoned_outcome_unknown');
  await f.service.tick(); assert.equal(f.sends.length, 1); assert.equal(f.posted(), 1);
  assert.deepEqual((await f.service.image('account-owner', f.catId, job.id)).bytes, bytes);
  await f.service.clearForReset(); assert.equal((await f.service.status('account-owner', f.catId)).jobs.length, 0);
});
