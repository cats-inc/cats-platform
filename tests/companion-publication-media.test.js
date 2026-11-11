import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { MemoryCompanionBoxStore, FileCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { CompanionMediaStore } from '../build/server/products/chat/companion/mediaStore.js';
import { CompanionPostService } from '../build/server/products/chat/companion/postService.js';
import { CompanionShareService } from '../build/server/products/chat/companion/shareService.js';
import { CompanionNotificationService } from '../build/server/products/chat/companion/notificationService.js';
import { createCompanionContentTools, COMPANION_CONTENT_POST_CREATE_TOOL } from '../build/server/products/chat/companion/supervisedContentTools.js';
import { countUnansweredHeartbeats } from '../build/server/products/chat/companion/life/heartbeat.js';

const now = () => new Date('2026-11-11T10:00:00.000Z');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-media-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new MemoryCompanionBoxStore();
  const media = new CompanionMediaStore(store, path.join(root, 'chat.json'), now);
  const posts = new CompanionPostService(store, now);
  const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#ca8b59' } }).png().toBuffer();
  return { root, store, media, posts, bytes };
}

test('media validates decoded bytes, snapshots source files and preserves the current cover during legacy import', async t => {
  const f = await fixture(t);
  const source = path.join(f.root, 'source'); await mkdir(source);
  const original = path.join(source, 'paris.png'); await writeFile(original, f.bytes);
  await f.store.updateLifeProfile('cat', { photoFolder: source }, now());
  assert.deepEqual(await f.media.sourceFiles('cat'), [{ path: 'paris.png', kind: 'image' }]);
  const asset = await f.media.importSource('cat', 'paris.png');
  assert.equal(asset.width, 16); assert.equal(asset.height, 12);
  assert.equal(asset.origin, 'source');
  assert.equal((await f.media.importSource('cat', 'paris.png')).id, asset.id);
  await writeFile(original, 'changed source');
  assert.equal((await f.media.read('cat', asset.id)).asset.sha256, asset.sha256);
  await assert.rejects(f.media.read('other', asset.id), { code: 'companion_media_not_found' });
  await assert.rejects(f.media.importSource('cat', '../chat.json'), { code: 'invalid_source_file' });
  await assert.rejects(f.media.image('cat', Buffer.from('<svg/>'), 'source'), { code: 'invalid_image_content' });
  const cover = await f.media.image('cat', f.bytes, 'cover');
  const second = await f.media.image('cat', await sharp(f.bytes).negate().png().toBuffer(), 'cover');
  await f.media.updateSettings('cat', { coverAssetId: cover.id });
  await f.media.updateSettings('cat', { coverAssetId: second.id }, true);
  assert.equal((await f.media.settings('cat')).coverAssetId, cover.id);
  await writeFile(path.join(f.media.directory, asset.fileName), 'tampered');
  await assert.rejects(f.media.read('cat', asset.id), { code: 'companion_media_unavailable' });
});

test('shared HTML/media are narrowly scoped, escaped, range-capable, origin-aware and revocable', async t => {
  const f = await fixture(t);
  const image = await f.media.image('cat', f.bytes, 'generated', { jobId: 'job-one' });
  const hidden = await f.media.image('cat', f.bytes, 'avatar');
  const post = await f.posts.create('cat', { requestKey: 'share', body: '<script>private-source-path</script>', attachments: [{ assetId: image.id, alt: 'Paris' }] });
  let origin = 'https://first.example';
  const shares = new CompanionShareService(f.store, f.media, () => origin, async () => 'Mochi <3', now);
  const first = await shares.create('cat', `post:${post.id}`);
  assert.equal((await shares.create('cat', `post:${post.id}`)).url, first.url);
  origin = 'https://next.example';
  assert.equal(new URL((await shares.create('cat', `post:${post.id}`)).url).origin, origin);
  const server = createServer((req, res) => { void shares.route(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}${new URL(first.url).pathname}`;
  const response = await fetch(url); const html = await response.text();
  assert.equal(response.status, 200); assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/); assert.match(html, /AI created/);
  assert.equal((await fetch(url, { method: 'HEAD' })).headers.get('content-length'), String(Buffer.byteLength(html)));
  assert.equal((await fetch(`${url}/media/${hidden.id}`)).status, 404);
  const partial = await fetch(`${url}/media/${image.id}`, { headers: { range: 'bytes=0-7' } });
  assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 8);
  assert.equal((await fetch(`${url}/media/${image.id}`, { headers: { range: 'bytes=999999-' } })).status, 416);
  await shares.revoke('cat', `post:${post.id}`);
  assert.equal((await fetch(url)).status, 404); assert.equal((await fetch(`${url}/media/${image.id}`)).status, 404);
  const fresh = await shares.create('cat', `post:${post.id}`); assert.notEqual(fresh.url, first.url);
  await f.posts.remove('cat', post.id);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${new URL(fresh.url).pathname}`)).status, 404);
  origin = undefined;
  await assert.rejects(shares.create('cat', `post:${post.id}`), { code: 'remote_access_required' });
});

test('notification intents deduplicate, suppress changed targets and preserve ambiguous Telegram sends across restart', async t => {
  const f = await fixture(t);
  const post = await f.posts.create('cat', { requestKey: 'notify', body: 'Paris' });
  const postId = `post:${post.id}`;
  const shares = new CompanionShareService(f.store, f.media, () => 'https://cats.example', async () => 'Mochi', now);
  let target = { owner: 'one' }; let sent = 0;
  const dependencies = { store: f.store, shares, now, resolveTarget: async () => target,
    localLink: async (catId, postId) => ({ post: await f.posts.get(catId, postId), url: 'cats://companion/v1/scope/cat/post/post-id' }),
    send: async (_intent, text, assertCurrent) => { await assertCurrent(); sent++; assert.match(text, /cats:\/\/companion/); return { state: 'sent', transportMessageId: 'one' }; } };
  const service = new CompanionNotificationService(dependencies);
  const a = await service.enqueue('cat', postId, 'dm');
  const b = await service.enqueue('cat', postId, 'dm'); assert.equal(a.id, b.id);
  await Promise.all([service.tick(), service.tick()]); assert.equal(sent, 1);
  await service.enqueue('cat', postId, 'telegram'); target = { owner: 'replacement' };
  await service.tick(); assert.equal(sent, 1);
  assert.equal((await f.store.readSnapshot()).notificationIntents.find(row => row.destination === 'telegram').state, 'suppressed');
  await f.store.transaction(snapshot => {
    for (const row of snapshot.notificationIntents) row.state = 'sending';
  });
  await new CompanionNotificationService(dependencies).tick();
  assert.equal((await f.store.readSnapshot()).notificationIntents.find(row => row.destination === 'telegram').state, 'uncertain');
  assert.equal(sent, 1, 'changed pinned DM target is suppressed on recovery too');
});

test('an interrupted final v1 backup is retained and a subsequent upgrade recovers', async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'snapshot.json');
  const old = await f.store.readSnapshot(); old.version = 1;
  for (const key of ['mediaAssets', 'publicationIntents', 'shareGrants', 'notificationIntents', 'mediaSettings']) delete old[key];
  const raw = JSON.stringify(old); await writeFile(file, raw);
  const backup = `${file}.v1-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}.bak`;
  await writeFile(backup, raw.slice(0, 20));
  assert.equal((await new FileCompanionBoxStore(file).readSnapshot()).version, 2);
  assert.equal(await readFile(backup, 'utf8'), raw);
  assert.equal((await readdir(f.root)).filter(name => name.includes('.incomplete-')).length, 1);
});

test('the existing producer retries after source deletion and keeps original publication time; old attachments survive text edits', async () => {
  const store = new MemoryCompanionBoxStore();
  const source = await store.ingestSource('cat', { kind: 'note', storageMode: 'linked_path', textContent: 'Paris' }, now());
  let time = now();
  const tools = createCompanionContentTools({ companionStore: store, resourceScopes: [{ kind: 'companion_content', catId: 'cat' }], now: () => time });
  const input = { catId: 'cat', requestKey: 'original', body: 'Paris', sourceIds: [source.source.id] };
  const first = await tools.executors[COMPANION_CONTENT_POST_CREATE_TOOL](input);
  await store.deleteSource('cat', source.source.id); time = new Date('2026-11-12T10:00:00Z');
  const retry = await tools.executors[COMPANION_CONTENT_POST_CREATE_TOOL](input);
  assert.equal(retry.status, 'applied'); assert.equal(retry.result.postId, first.result.postId);
  assert.equal(retry.result.publishedAt, first.result.publishedAt);
  await store.transaction(snapshot => {
    const row = snapshot.derived.find(row => row.id === first.result.derivedId);
    delete row.metadata.profilePostAttachments; row.metadata.profilePostMediaRefs = [{ kind: 'source', id: 'legacy-photo' }];
  });
  const changed = await new CompanionPostService(store, now).update('cat', first.result.postId, { requestKey: 'edit', expectedRevision: 1, body: 'Edited' });
  assert.deepEqual(changed.metadata.profilePostMediaRefs, [{ kind: 'source', id: 'legacy-photo' }]);
});

test('heartbeat posts and notifications count once with a same-action conversational message', async t => {
  const f = await fixture(t);
  await f.media.updateSettings('cat', { autoPost: true });
  const input = { requestKey: 'heartbeat', body: 'Paris' };
  const created = await f.posts.create('cat', input, { trigger: 'heartbeat', actionId: 'beat-one' });
  assert.equal((await f.posts.create('cat', input, { trigger: 'heartbeat' })).id, created.id);
  await assert.rejects(f.posts.create('cat', { ...input, requestKey: 'second' }, { trigger: 'heartbeat' }), { code: 'automatic_post_limit' });
  const time = now().toISOString();
  const messages = [{ id: 'dm', createdAt: time, metadata: { companionHeartbeat: { kind: 'regular', actionId: 'beat-one' } } }];
  assert.equal(countUnansweredHeartbeats({ messages }, 0, [{ createdAt: time, kind: 'regular', actionId: 'beat-one' }]), 1);
  assert.equal(countUnansweredHeartbeats({ messages: [] }, 0, [{ createdAt: time, kind: 'regular', actionId: 'beat-one' }]), 1);
  assert.equal(countUnansweredHeartbeats({ messages }, now().getTime() + 1, [{ createdAt: time, kind: 'regular', actionId: 'beat-one' }]), 0);
});


test('revocation during final asynchronous recipient resolution prevents the transport call', async t => {
  const f = await fixture(t); const post = await f.posts.create('cat', { requestKey: 'last-check', body: 'Paris' });
  const postId = `post:${post.id}`;
  const shares = new CompanionShareService(f.store, f.media, () => 'https://cats.example', async () => 'Mochi', now);
  let resolutions = 0; let sends = 0;
  const service = new CompanionNotificationService({ store: f.store, shares, now,
    localLink: async () => ({ post, url: 'cats://test' }),
    resolveTarget: async () => { if (++resolutions === 3) await shares.revoke('cat', postId); return { owner: 'owner' }; },
    send: async (_intent, _body, assertCurrent) => { await assertCurrent(); sends++; return { state: 'sent', transportMessageId: 'unexpected' }; },
  });
  await service.enqueue('cat', postId, 'telegram'); await service.tick();
  assert.equal(sends, 0); assert.equal((await f.store.readSnapshot()).notificationIntents[0].state, 'suppressed');
});


test('public companion routes pass the real authenticated host and dedicated ingress without exposing internal tools', async t => {
  const f = await fixture(t);
  const { createServer: createPlatformServer } = await import('../build/server/app/server/index.js');
  const { createPlatformIngressListener } = await import('../build/server/platform/apps/ingressBoundary.js');
  const { loadConfig } = await import('../build/server/config.js');
  const { MemoryCoreStore } = await import('../build/server/core/store.js');
  const { MemoryChatStore } = await import('../build/server/products/chat/state/store.js');
  const image = await f.media.image('cat', f.bytes, 'generated');
  const post = await f.posts.create('cat', { requestKey: 'real-router', body: 'Paris', attachments: [{ assetId: image.id, alt: 'Paris' }] });
  let origin;
  const shares = new CompanionShareService(f.store, f.media, () => origin, async () => 'Mochi', now);
  const config = loadConfig({ HOME: f.root, CATS_PLATFORM_DIR: path.join(f.root, 'platform'), CATS_AUTH_SESSION_SECRET: 'fixture-secret-at-least-sixteen' });
  const server = createPlatformServer({ shared: { config, coreStore: new MemoryCoreStore(), desktopAppsKey: 'fixture-disabled',
    runtimeClient: { getHealth: async () => ({ reachable: false, baseUrl: 'http://127.0.0.1:1' }) } },
    chat: { chatStore: new MemoryChatStore(), companionStore: f.store,
      companionPublications: { shares, tick: async () => {}, close: async () => {}, isIdle: () => true } } });
  const listener = await createPlatformIngressListener({ port: 0, origin: () => origin, ready: async () => true,
    dispatch: async (request, response) => { server.emit('request', request, response); } });
  origin = listener.target;
  t.after(async () => { await listener.close(); await server.closeAppHosting(); await server.startupRecovery; });
  const link = await shares.create('cat', `post:${post.id}`);
  assert.equal((await fetch(link.url)).status, 200);
  assert.equal((await fetch(link.url + '/media/' + image.id, { headers: { range: 'bytes=0-7' } })).status, 206);
  assert.equal((await fetch(origin + '/api/internal/cat-image-tools')).status, 403);
  assert.notEqual((await fetch(origin + '/api/cats/cat/companion-box/media/' + image.id)).status, 200);
  await shares.revoke('cat', `post:${post.id}`);
  assert.equal((await fetch(link.url)).status, 404);
});
