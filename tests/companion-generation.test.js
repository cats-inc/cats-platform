import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createDefaultCoreState } from '../build/server/core/model/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createCat, createChannel, setChannelCatLease, setChannelStatus } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { createChatCatImages } from '../build/server/products/chat/api/catImages.js';
import { createCompanionPublications } from '../build/server/products/chat/api/companionPublications.js';
import { RuntimeImageError, projectImageCapabilities } from '../build/server/runtime/images.js';
import { projectMediaJob, projectMediaCapabilities } from '../build/server/runtime/media.js';
import { RUNTIME_SUPERVISION_BOUNDARY } from '../build/server/platform/supervision/runtimeBoundary.js';

const now = () => new Date('2026-11-11T12:00:00.000Z');
async function fixture(t, companion = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-post-generation-'));
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#cd7941' } }).png().toBuffer();
  const output = { mimeType: 'image/png', width: 32, height: 32, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), transparency: 'opaque' };
  let state = createCat(createDefaultChatState(), { name: 'Paris Cat', provider: 'grok', group: 'standard', roles: companion ? ['companion'] : [] }, now());
  const cat = state.cats.find(row => row.name === 'Paris Cat'); cat.avatarUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  state = createChannel(state, { title: 'Private DM', topic: '', roomMode: 'direct_message', originSurface: 'chat', defaultRecipientId: cat.id, participantCatIds: [cat.id] }, now());
  const laneId = state.selectedChannelId;
  state = setChannelStatus(state, laneId, 'active', now());
  state = setChannelCatLease(state, laneId, cat.id, { status: 'ready', sessionId: 'source-session' }, now());
  const chatStore = new MemoryChatStore(); await chatStore.writeSnapshot(state, createDefaultCoreState(now()));
  const companionStore = new MemoryCompanionBoxStore();
  const caps = { schemaVersion: 2, mediaContractVersion: 3, sourceSessionYield: true, revision: 'test', maxPromptLength: 2000, maxImageBytes: 8388608,
    targets: [{ id: 'grok/native', provider: 'grok', instance: 'native' }], profiles: [
      { id: 'reference', operation: 'image.edit', revision: 1, targetIds: ['grok/native'], inputs: { min: 1, max: 3 }, aspectRatio: { mode: 'native', options: ['1:1'] }, agentConfigs: [{ id: 'grok-reference', model: 'grok-test', effort: 'xhigh' }] }] };
  const remote = new Map(); const uploads = []; let posted = 0; let failUpload = false;
  const runtimeClient = {
    async getMediaCapabilities() { return projectMediaCapabilities(caps); }, async getImageCapabilities() { return projectImageCapabilities(caps); },
    async putMediaSource(id, data) { if (failUpload) throw new Error('source offline'); uploads.push({ id, data }); return { id, metadata: { ...output, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') } }; },
    async submitImageJob() { throw new Error('must not use V2'); }, async getImageJob() { throw new Error('must not poll V2'); },
    async submitMediaJob(input) { posted++; const job = { ...input, schemaVersion: 3, provider: 'grok', instance: 'native', status: 'running',
      agentModel: 'grok-test', agentEffort: 'xhigh', warnings: [], error: null, executionOutcome: null, output: null, createdAt: now().toISOString(), updatedAt: now().toISOString() };
      remote.set(job.id, job); return projectMediaJob(job); },
    async getMediaJob(id) { const job = remote.get(id); if (!job) throw new RuntimeImageError('image_not_found');
      return projectMediaJob({ ...job, status: 'succeeded', output, executionOutcome: 'completed' }); },
    async getImageBytes() { throw new Error('must not collect V2'); }, async getMediaBytes() { return bytes; },
    async cancelMediaJob(id) { return projectMediaJob({ ...remote.get(id), status: 'cancelled' }); },
    async observeSession() { return { session: { status: 'ready', turnInFlight: false } }; },
  };
  let publications; const dependencies = { chatStore, companionStore, runtimeClient, config: { platformDir: root, chatStatePath: path.join(root, 'state', 'chat-state.local.json') }, now,
    mutationGate: { run: async (_key, operation) => operation() }, publicOrigin: () => 'https://candidate.example' };
  const images = createChatCatImages({ ...dependencies,
    preparePublicationSources: job => publications.generation.prepareSources(job), authorizePublication: caller => publications.generation.authorize(caller, 'deliveryMode' in caller) });
  publications = createCompanionPublications({ ...dependencies, imageService: () => images.service() });
  t.after(async () => { await images.close(); await rm(root, { recursive: true, force: true, maxRetries: 5 }); });
  return { root, cat, laneId, publications, images, chatStore, companionStore, bytes, uploads, initialMessages: state.channels.find(row => row.id === laneId).messages.length, posted: () => posted, failUpload(value) { failUpload = value; } };
}
async function settle(f, id) {
  for (let n = 0; n < 100; n++) { const job = f.images.service().publicationJob(f.cat.id, id); if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('generation did not settle');
}

test('ordinary Cat uses exact avatar bytes, polls V3 and publishes once without a Telegram policy or second model turn', async t => {
  const f = await fixture(t); const input = { requestKey: 'paris-once', kind: 'image', prompt: 'same cat at Eiffel Tower', body: '我今天到巴黎了' };
  const first = await f.publications.generation.ownerGenerate(f.cat.id, input);
  assert.equal(first.publication.state, 'waiting_for_media'); assert.equal((await f.publications.posts.list(f.cat.id)).items.length, 0);
  assert.equal((await f.publications.generation.ownerGenerate(f.cat.id, input)).job.id, first.job.id);
  assert.equal((await settle(f, first.job.id)).status, 'succeeded');
  await f.publications.tick(); await f.publications.tick();
  const posts = (await f.publications.posts.list(f.cat.id)).items;
  assert.equal(posts.length, 1); assert.equal(posts[0].content, input.body); assert.equal(posts[0].metadata.profilePostAiGenerated, true);
  assert.equal(f.posted(), 1); assert.equal(f.uploads.length, 1); assert.deepEqual(f.uploads[0].data, f.bytes);
  assert.equal((await f.chatStore.read()).channels.find(row => row.id === f.laneId).messages.length, f.initialMessages);
  const notification = await f.publications.notifications.enqueue(f.cat.id, `post:${posts[0].id}`, 'dm');
  await f.publications.tick(); await f.publications.tick();
  const finalNotification = (await f.companionStore.readSnapshot()).notificationIntents.find(row => row.id === notification.id);
  assert.equal(finalNotification.state, 'sent', JSON.stringify(finalNotification));
  const messages = (await f.chatStore.read()).channels.find(row => row.id === f.laneId).messages;
  assert.equal(messages.length, f.initialMessages + 1); assert.match(messages.at(-1).body, /cats:\/\/companion\/v1\//);
  assert.equal((await f.companionStore.readSnapshot()).notificationIntents.find(row => row.id === notification.id).state, 'sent');
  await f.publications.posts.remove(f.cat.id, `post:${posts[0].id}`); await f.publications.tick();
  assert.equal((await f.publications.posts.list(f.cat.id)).items.length, 0);
});

test('source preparation failure never submits a Runtime job or permanently blocks later creation', async t => {
  const f = await fixture(t); f.failUpload(true);
  const input = { requestKey: 'fail-upload', kind: 'image', prompt: 'cat in Paris', body: 'Paris' };
  const first = await f.publications.generation.ownerGenerate(f.cat.id, input);
  assert.equal((await settle(f, first.job.id)).error, 'media_source_preparation_failed'); assert.equal(f.posted(), 0);
  await f.publications.tick(); assert.equal((await f.companionStore.readSnapshot()).publicationIntents[0].state, 'failed');
  f.failUpload(false); const second = await f.publications.generation.ownerGenerate(f.cat.id, { ...input, requestKey: 'recovered-upload' });
  assert.equal((await settle(f, second.job.id)).status, 'succeeded'); await f.publications.tick();
  assert.equal((await f.publications.posts.list(f.cat.id)).items.length, 1);
});

test('single Cat tool scope queues a pending post, releases on turn end, and cancellation never publishes a late asset', async t => {
  const f = await fixture(t, true); await f.companionStore.updateLifeProfile(f.cat.id, { enabled: true, mode: 'companion' }, now());
  await f.publications.media.updateSettings(f.cat.id, { autoPost: true, autoShare: false, notify: [] });
  const turn = await f.publications.resolveTurn('source-session', { context: { metadata: { supervisionBoundary: RUNTIME_SUPERVISION_BOUNDARY,
    supervisionProduct: 'cats-chat', supervisionSurface: 'companion-heartbeat', supervisionToolName: 'cats.runtime.message.send', supervisionRunId: f.laneId, supervisionActionId: 'heartbeat-once' } } });
  assert.ok(turn);
  const generated = await f.publications.callTool('media_generate', { kind: 'image', prompt: 'same cat in Paris' }, turn);
  assert.equal(generated.isError, undefined); const id = generated.structuredContent.jobId;
  assert.equal(f.images.service().publicationJob(f.cat.id, id).dispatchState, 'held'); assert.equal(f.posted(), 0);
  const queued = await f.publications.callTool('post_create', { body: 'Paris', pendingJobIds: [id] }, turn);
  assert.equal(queued.isError, undefined);
  assert.equal((await f.publications.callTool('post_share', { postId: queued.structuredContent.publication.postId }, turn)).isError, true);
  await f.publications.generation.cancel(f.cat.id, queued.structuredContent.publication.id);
  f.images.releaseTurn('source-session'); await f.publications.tick();
  assert.equal(f.posted(), 0); assert.equal((await f.publications.posts.list(f.cat.id)).items.length, 0);
});


async function heartbeatTurn(f) {
  await f.companionStore.updateLifeProfile(f.cat.id, { enabled: true, mode: 'companion' }, now());
  await f.publications.media.updateSettings(f.cat.id, { autoPost: true, autoShare: true, notify: ['dm', 'telegram'] });
  return f.publications.resolveTurn('source-session', { context: { metadata: { supervisionBoundary: RUNTIME_SUPERVISION_BOUNDARY,
    supervisionProduct: 'cats-chat', supervisionSurface: 'companion-heartbeat', supervisionToolName: 'cats.runtime.message.send',
    supervisionRunId: f.laneId, supervisionActionId: 'heartbeat-lifecycle' } } });
}

test('turn-active heartbeat cannot create a share after autoShare is disabled before commit', async t => {
  const f = await fixture(t, true); const turn = await heartbeatTurn(f);
  const post = await f.publications.posts.create(f.cat.id, { requestKey: 'share-race', body: 'Paris' });
  const transaction = f.companionStore.transaction.bind(f.companionStore); let injected = false;
  f.companionStore.transaction = async operation => {
    if (!injected) { injected = true; await transaction(snapshot => { snapshot.mediaSettings.find(row => row.catId === f.cat.id).autoShare = false; }); }
    return transaction(operation);
  };
  const result = await f.publications.callTool('post_share', { postId: `post:${post.id}` }, turn);
  assert.equal(result.isError, true); assert.equal((await f.companionStore.readSnapshot()).shareGrants.length, 0);
});

test('accepted heartbeat creation finishes after autonomous activity stops; autoPost revocation still blocks it', async t => {
  for (const revoke of [false, true]) {
    const f = await fixture(t, true); const turn = await heartbeatTurn(f);
    const generated = await f.publications.callTool('media_generate', { kind: 'image', prompt: 'same cat in Paris' }, turn);
    const id = generated.structuredContent.jobId;
    await f.publications.callTool('post_create', { body: 'Paris', pendingJobIds: [id] }, turn);
    await f.companionStore.updateLifeProfile(f.cat.id, { enabled: false }, now());
    if (revoke) await f.publications.media.updateSettings(f.cat.id, { autoPost: false });
    f.images.releaseTurn('source-session'); await settle(f, id); await f.publications.tick();
    assert.equal((await f.publications.posts.list(f.cat.id)).items.length, revoke ? 0 : 1);
  }
});

test('completed manual media cannot publish after its Cat is removed', async t => {
  const f = await fixture(t);
  const first = await f.publications.generation.ownerGenerate(f.cat.id, { requestKey: 'removed-cat', kind: 'image', prompt: 'Paris', body: 'Paris' });
  await settle(f, first.job.id);
  const state = await f.chatStore.read(); state.cats = [];
  await f.chatStore.writeSnapshot(state, await f.chatStore.readCore());
  await f.publications.tick();
  assert.equal((await f.publications.posts.list(f.cat.id)).items.length, 0);
  assert.equal((await f.companionStore.readSnapshot()).publicationIntents[0].state, 'failed');
});


test('disabling profile references before dispatch prevents uploading a pinned avatar', async t => {
  const f = await fixture(t, true); const turn = await heartbeatTurn(f);
  const generated = await f.publications.callTool('media_generate', { kind: 'image', prompt: 'cat in Paris' }, turn);
  const job = f.publications.generation.job(f.cat.id, generated.structuredContent.jobId);
  await f.publications.media.updateSettings(f.cat.id, { useProfileImages: false });
  await assert.rejects(f.publications.generation.prepareSources(job), { code: 'profile_references_disabled' });
  await assert.rejects(f.publications.generation.authorize(job, true), { code: 'profile_references_disabled' });
  f.images.releaseTurn('source-session'); await settle(f, job.id);
  assert.equal(f.uploads.length, 0); assert.equal(f.posted(), 0);
});
