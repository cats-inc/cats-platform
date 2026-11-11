import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileCompanionBoxStore, MemoryCompanionBoxStore } from '../build/server/products/chat/state/companion-box/index.js';
import { CompanionPostService } from '../build/server/products/chat/companion/postService.js';

const now = () => new Date('2026-11-11T10:00:00Z');
const collections = ['mediaAssets', 'publicationIntents', 'shareGrants', 'notificationIntents', 'mediaSettings'];
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cats-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'companion.json');
  return { root, file, store: new FileCompanionBoxStore(file) };
}

function asset(catId = 'cat-one', kind = 'image') {
  const id = randomUUID();
  return { id, catId, kind, fileName: `${id}.${kind === 'image' ? 'png' : 'mp4'}`,
    mimeType: kind === 'image' ? 'image/png' : 'video/mp4', bytes: 12, sha256: hash(id),
    width: 100, height: 100, durationSeconds: kind === 'image' ? null : 5,
    origin: 'generated', sourceIds: [], jobId: randomUUID(), createdAt: now().toISOString() };
}

test('companion v1 upgrade preserves posts, sources, life and additive data; backs up exact bytes once', async t => {
  const { root, file, store } = await fixture(t);
  const source = await store.ingestSource('cat-one', { kind: 'note', storageMode: 'linked_path', textContent: 'Paris' }, now());
  const post = await new CompanionPostService(store, now).create('cat-one', { requestKey: 'original', body: 'Paris', sourceIds: [source.source.id] });
  await new CompanionPostService(store, now).remove('cat-one', post.id);
  await store.updateLifeProfile('cat-one', { photoFolder: root }, now());
  const old = await store.readSnapshot();
  old.version = 1;
  for (const name of collections) delete old[name];
  old.extension = { preserved: true };
  old.boxes[0].extension = 'box extension';
  const raw = JSON.stringify(old);
  await writeFile(file, raw);
  const migrated = await new FileCompanionBoxStore(file).readSnapshot();
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.extension, old.extension);
  assert.equal(migrated.boxes[0].extension, old.boxes[0].extension);
  assert.equal(migrated.boxes[0].life.photoFolder, root);
  assert.equal(migrated.sources[0].id, source.source.id);
  assert.equal(migrated.derived.find(row => row.id === post.id).metadata.profilePostStatus, 'removed');
  for (const name of collections) assert.deepEqual(migrated[name], []);
  const backups = (await readdir(root)).filter(name => name.endsWith('.bak'));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(root, backups[0]), 'utf8'), raw);
  const saved = await readFile(file, 'utf8');
  await new FileCompanionBoxStore(file).readSnapshot();
  assert.equal(await readFile(file, 'utf8'), saved);
  assert.equal((await readdir(root)).filter(name => name.endsWith('.bak')).length, 1);
});

test('unknown and lossy snapshots are preserved; restoring the recognized backup permits retry', async t => {
  const { root, file, store } = await fixture(t);
  const valid = await store.readSnapshot();
  for (const bad of [{ ...valid, version: 99 }, { ...valid, version: 1, derived: [{ id: 'broken' }] },
    { ...valid, shareGrants: [{ id: 'partial' }] }]) {
    const raw = JSON.stringify(bad);
    await writeFile(file, raw);
    await assert.rejects(store.readSnapshot());
    assert.equal(await readFile(file, 'utf8'), raw);
    assert.equal((await readdir(root)).filter(name => name.endsWith('.bak')).length, 0);
  }
  await writeFile(file, JSON.stringify(valid));
  assert.equal((await store.readSnapshot()).version, 2);
});

test('all writers sharing a file serialize existing operations and new transactions', async t => {
  const { file, store } = await fixture(t);
  const other = new FileCompanionBoxStore(file);
  await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? store : other)
    .ingestSource('cat-one', { kind: 'note', storageMode: 'linked_path', textContent: `source ${index}` }, now())));
  assert.equal((await store.listSources('cat-one')).length, 24);
  const before = await readFile(file, 'utf8');
  await assert.rejects(store.transaction(snapshot => { snapshot.sources = []; throw new Error('interrupted'); }));
  assert.equal(await readFile(file, 'utf8'), before);
  await assert.rejects(store.transaction(async snapshot => { snapshot.sources = []; }));
  assert.equal(await readFile(file, 'utf8'), before);
  await other.updateLifeProfile('cat-one', { photoFolder: null }, now());
  assert.equal((await store.listSources('cat-one')).length, 24);
});

for (const backend of ['file', 'memory']) {
  test(`${backend}: concurrent create is idempotent, revision conflicts are explicit, removed posts stay removed`, async t => {
    const store = backend === 'file' ? (await fixture(t)).store : new MemoryCompanionBoxStore();
    const posts = new CompanionPostService(store, now);
    const input = { requestKey: 'paris', body: '我今天到巴黎了！' };
    const results = await Promise.all(Array.from({ length: 12 }, () => posts.create('cat-one', input)));
    assert.equal(new Set(results.map(row => row.id)).size, 1);
    assert.equal((await store.readSnapshot()).publicationIntents.length, 1);
    await assert.rejects(posts.create('cat-one', { ...input, body: 'different' }), { code: 'post_request_conflict' });
    const post = results[0];
    const update = { requestKey: 'edit', expectedRevision: 1, body: '到巴黎鐵塔了！' };
    await posts.update('cat-one', post.id, update);
    assert.equal((await posts.update('cat-one', post.id, update)).metadata.profilePostRevision, 2);
    await assert.rejects(posts.update('cat-one', post.id, { ...update, requestKey: 'stale' }), { code: 'post_revision_conflict' });
    await assert.rejects(posts.remove('cat-other', post.id), { code: 'companion_post_not_found' });
    assert.equal((await posts.remove('cat-one', post.id)).changed, true);
    assert.equal((await posts.remove('cat-one', post.id)).changed, false);
    assert.equal((await posts.create('cat-one', input)).metadata.profilePostStatus, 'removed');
    await assert.rejects(posts.update('cat-one', post.id, update), { code: 'companion_post_removed' });
    assert.deepEqual((await posts.list('cat-one')).items, []);
  });
}

test('attachments retain order, reject cross-cat and mixed video, and survive original source removal', async () => {
  const store = new MemoryCompanionBoxStore();
  const posts = new CompanionPostService(store, now);
  const [first, second, foreign, video] = [asset(), asset(), asset('cat-other'), asset('cat-one', 'video')];
  await store.transaction(snapshot => { snapshot.mediaAssets.push(first, second, foreign, video); });
  const source = await store.ingestSource('cat-one', { kind: 'note', storageMode: 'linked_path', textContent: 'Original' }, now());
  const input = { requestKey: 'media', body: '', sourceIds: [source.source.id],
    attachments: [second, first].map(row => ({ assetId: row.id, alt: 'AI Paris' })) };
  const post = await posts.create('cat-one', input);
  assert.deepEqual(post.metadata.profilePostMediaRefs.map(ref => ref.id), [second.id, first.id]);
  assert.equal(post.metadata.profilePostAiGenerated, true);
  await assert.rejects(posts.create('cat-one', { requestKey: 'foreign', attachments: [{ assetId: foreign.id, alt: '' }] }), { code: 'companion_media_not_found' });
  await assert.rejects(posts.create('cat-one', { requestKey: 'mixed', attachments: [first, video].map(row => ({ assetId: row.id, alt: '' })) }), { code: 'invalid_post_attachments' });
  await store.updateSource('cat-one', source.source.id, { textContent: 'Changed source' }, now());
  assert.equal((await posts.get('cat-one', post.id)).id, post.id);
  await store.deleteSource('cat-one', source.source.id, now());
  assert.equal((await posts.get('cat-one', post.id)).id, post.id);
  assert.equal((await store.readSnapshot()).mediaAssets.length, 4);
});

test('delete atomically revokes grants and pending delivery while retaining uncertain outcomes and assets', async () => {
  const store = new MemoryCompanionBoxStore();
  const posts = new CompanionPostService(store, now);
  const post = await posts.create('cat-one', { requestKey: 'delete', body: 'Hello' });
  const postId = `post:${post.id}`;
  await store.transaction(snapshot => {
    const token = 'a'.repeat(32);
    snapshot.shareGrants.push({ id: randomUUID(), catId: 'cat-one', postId, token, tokenHash: hash(token),
      createdAt: now().toISOString(), revokedAt: null });
    for (const state of ['pending', 'uncertain']) snapshot.notificationIntents.push({ id: randomUUID(), catId: 'cat-one',
      postId, revision: 1, destination: 'telegram', state, transportMessageId: null, error: null,
      createdAt: now().toISOString(), updatedAt: now().toISOString() });
  });
  await posts.remove('cat-one', postId);
  const snapshot = await store.readSnapshot();
  assert.ok(snapshot.shareGrants[0].revokedAt);
  assert.deepEqual(snapshot.notificationIntents.map(row => row.state), ['suppressed', 'uncertain']);
  assert.equal(snapshot.publicationIntents[0].state, 'cancelled');
});

test('cursor continues through equal timestamps even when the boundary post was removed', async () => {
  const store = new MemoryCompanionBoxStore();
  const posts = new CompanionPostService(store, now);
  for (let index = 0; index < 22; index++) await posts.create('cat-one', { requestKey: `post-${index}`, body: `${index}` });
  const first = await posts.list('cat-one');
  assert.equal(first.items.length, 20);
  await posts.remove('cat-one', first.items.at(-1).id);
  const next = await posts.list('cat-one', first.nextCursor);
  assert.equal(next.items.length, 2);
  assert.equal(next.nextCursor, null);
  assert.ok(next.items.every(row => !first.items.some(old => old.id === row.id)));
});
