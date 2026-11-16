import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createServer } from '../build/server/app/server/index.js';
import {
  addCatteryMember,
  addClowderMember,
  createCattery,
  createClowder,
  deleteCattery,
  deleteClowder,
  moveClowderMember,
  removeCatFromDirectory,
  updateClowder,
  updateClowderMember,
} from '../build/server/platform/directory/model.js';
import {
  createEmptyDirectorySnapshot,
  deriveDirectoryStatePath,
} from '../build/server/platform/directory/snapshot.js';
import { FileDirectoryStore, directoryStoreFor } from '../build/server/platform/directory/store.js';
import { createCat } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { removePlatformOwnedData } from '../build/server/shared/platformDataReset.js';

const NOW = new Date('2026-11-16T08:00:00.000Z');
const LATER = new Date('2026-11-16T09:00:00.000Z');

function context(catIds = ['mochi', 'tiger', 'tofu'], now = NOW) {
  let next = 0;
  return { now, catIds: new Set(catIds), createId: (kind) => `${kind}-${++next}` };
}

function seeded() {
  const ctx = context();
  let snapshot = createEmptyDirectorySnapshot(NOW.toISOString());
  ({ snapshot } = createCattery(snapshot, {
    name: '  Furball Studio ',
    domain: 'Furball.Studio',
    members: [{ catId: 'mochi', role: 'owner' }, { catId: 'tofu', status: 'external' }],
  }, ctx));
  ({ snapshot } = createClowder(snapshot, {
    name: 'Dev',
    parentCatteryId: 'cattery-1',
    members: [{ catId: 'mochi', role: 'lead' }, { catId: 'tiger', status: 'temp', expiresAt: '2026-12-31' }],
  }, ctx));
  ({ snapshot } = createClowder(snapshot, { name: 'Marketing', parentCatteryId: 'cattery-1' }, ctx));
  return { snapshot, ctx };
}

function clowderMembers(snapshot, clowderId) {
  return snapshot.clowderMemberships.filter((member) => member.clowderId === clowderId);
}

test('creating groups trims names, lowercases the domain and records members', () => {
  const { snapshot } = seeded();
  assert.equal(snapshot.catteries[0].name, 'Furball Studio');
  assert.equal(snapshot.catteries[0].domain, 'furball.studio');
  assert.deepEqual(snapshot.clowders.map((clowder) => [clowder.id, clowder.parentCatteryId]), [
    ['clowder-2', 'cattery-1'],
    ['clowder-3', 'cattery-1'],
  ]);
  const tiger = clowderMembers(snapshot, 'clowder-2').find((member) => member.catId === 'tiger');
  assert.equal(tiger.status, 'temp');
  assert.equal(tiger.expiresAt, '2026-12-31T00:00:00.000Z');
  assert.equal(tiger.role, 'member');
});

test('a Clowder does not need a Cattery and a Cat does not need a group', () => {
  const ctx = context();
  const { snapshot, clowder } = createClowder(createEmptyDirectorySnapshot(NOW.toISOString()), { name: 'Phoenix' }, ctx);
  assert.equal(clowder.parentCatteryId, null);
  assert.deepEqual(snapshot.clowderMemberships, []);
});

test('input rules: names, missing Cats and Catteries, temp only where allowed', () => {
  const empty = createEmptyDirectorySnapshot(NOW.toISOString());
  const ctx = context();
  assert.throws(() => createClowder(empty, { name: '   ' }, ctx), { code: 'directory_name_required' });
  assert.throws(() => createClowder(empty, { name: 'x'.repeat(81) }, ctx), { code: 'directory_name_too_long' });
  assert.throws(() => createClowder(empty, { name: 'Dev', parentCatteryId: 'nope' }, ctx), { code: 'cattery_not_found' });
  assert.throws(() => createClowder(empty, { name: 'Dev', members: [{ catId: 'ghost' }] }, ctx), { code: 'cat_not_found' });
  assert.throws(() => createClowder(empty, { name: 'Dev', members: [{ catId: 'mochi' }, { catId: 'mochi' }] }, ctx),
    { code: 'duplicate_member' });
  assert.throws(() => createClowder(empty, { name: 'Dev', members: [{ catId: 'mochi', expiresAt: '2026-12-31' }] }, ctx),
    { code: 'expires_at_requires_temp' });
  assert.throws(() => createCattery(empty, { name: 'Acme', members: [{ catId: 'mochi', status: 'temp' }] }, ctx),
    { code: 'cattery_temp_not_allowed' });
  assert.throws(() => createCattery(empty, { name: 'Acme', domain: 'not a domain' }, ctx), { code: 'cattery_domain_invalid' });
});

test('a Clowder keeps the Cattery it was created in', () => {
  const { snapshot, ctx } = seeded();
  assert.throws(() => updateClowder(snapshot, 'clowder-2', { parentCatteryId: null }, ctx), { code: 'clowder_parent_fixed' });
  const renamed = updateClowder(snapshot, 'clowder-2', { name: 'Engineering', parentCatteryId: 'cattery-1' }, ctx);
  assert.equal(renamed.clowder.name, 'Engineering');
});

test('adding a Cat that is already a member changes nothing', () => {
  const { snapshot, ctx } = seeded();
  const result = addClowderMember(snapshot, 'clowder-2', { catId: 'mochi', status: 'external' }, ctx);
  assert.equal(result.added, false);
  assert.equal(result.snapshot, snapshot);
  assert.equal(result.membership.status, 'formal');
  assert.equal(addCatteryMember(snapshot, 'cattery-1', { catId: 'mochi' }, ctx).added, false);
});

test('leaving temp clears the end date; staying temp keeps it', () => {
  const { snapshot, ctx } = seeded();
  const lead = updateClowderMember(snapshot, 'clowder-2', 'tiger', { role: 'lead' }, ctx);
  assert.equal(lead.membership.expiresAt, '2026-12-31T00:00:00.000Z');
  const formal = updateClowderMember(snapshot, 'clowder-2', 'tiger', { status: 'formal' }, ctx);
  assert.equal(formal.membership.expiresAt, null);
  assert.throws(() => updateClowderMember(snapshot, 'clowder-2', 'mochi', { expiresAt: '2026-12-31' }, ctx),
    { code: 'expires_at_requires_temp' });
});

test('moving a Cat is one step: it leaves the source and joins the target with its status', () => {
  const { snapshot, ctx } = seeded();
  const moved = moveClowderMember(snapshot, { catId: 'tiger', fromClowderId: 'clowder-2', toClowderId: 'clowder-3' }, ctx);
  assert.deepEqual(clowderMembers(moved.snapshot, 'clowder-2').map((member) => member.catId), ['mochi']);
  assert.deepEqual(clowderMembers(moved.snapshot, 'clowder-3').map((member) => [member.catId, member.role, member.status, member.expiresAt]), [
    ['tiger', 'member', 'temp', '2026-12-31T00:00:00.000Z'],
  ]);
  assert.throws(() => moveClowderMember(snapshot, { catId: 'tiger', fromClowderId: 'clowder-2', toClowderId: 'clowder-2' }, ctx),
    { code: 'same_clowder' });
  assert.throws(() => moveClowderMember(snapshot, { catId: 'tofu', fromClowderId: 'clowder-2', toClowderId: 'clowder-3' }, ctx),
    { code: 'membership_not_found' });
});

test('moving into a Clowder the Cat is already in only leaves the source', () => {
  const { snapshot, ctx } = seeded();
  const joined = addClowderMember(snapshot, 'clowder-3', { catId: 'tiger', role: 'lead' }, ctx).snapshot;
  const moved = moveClowderMember(joined, { catId: 'tiger', fromClowderId: 'clowder-2', toClowderId: 'clowder-3' }, ctx);
  assert.deepEqual(moved.snapshot.clowderMemberships.filter((member) => member.catId === 'tiger')
    .map((member) => [member.clowderId, member.role, member.status]), [['clowder-3', 'lead', 'formal']]);
});

test('deleting a Cattery keeps its Clowders and their members; only its own memberships end', () => {
  const { snapshot } = seeded();
  const next = deleteCattery(snapshot, 'cattery-1', context(undefined, LATER));
  assert.deepEqual(next.catteries, []);
  assert.deepEqual(next.catteryMemberships, []);
  assert.deepEqual(next.clowders.map((clowder) => [clowder.name, clowder.parentCatteryId, clowder.updatedAt]), [
    ['Dev', null, LATER.toISOString()],
    ['Marketing', null, LATER.toISOString()],
  ]);
  assert.equal(next.clowderMemberships.length, snapshot.clowderMemberships.length);
});

test('deleting a Clowder ends only its memberships', () => {
  const { snapshot, ctx } = seeded();
  const next = deleteClowder(snapshot, 'clowder-2', ctx);
  assert.deepEqual(next.clowders.map((clowder) => clowder.id), ['clowder-3']);
  assert.deepEqual(next.clowderMemberships, []);
  assert.equal(next.catteryMemberships.length, 2);
});

test('a deleted Cat leaves every group; nothing else changes', () => {
  const { snapshot } = seeded();
  const next = removeCatFromDirectory(snapshot, 'mochi', LATER);
  assert.deepEqual(next.clowderMemberships.map((member) => member.catId), ['tiger']);
  assert.deepEqual(next.catteryMemberships.map((member) => member.catId), ['tofu']);
  assert.equal(next.clowders.length, 2);
  assert.equal(removeCatFromDirectory(next, 'ghost', LATER), next);
});

async function withTempDir(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-directory-'));
  try {
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the store reads a missing file as empty and only writes on change', async () => {
  await withTempDir(async (dir) => {
    const store = new FileDirectoryStore(path.join(dir, 'chat-state.local.directory.json'));
    assert.deepEqual((await store.read()).clowders, []);
    await store.update((snapshot) => ({ snapshot: removeCatFromDirectory(snapshot, 'mochi', NOW), result: null }));
    await assert.rejects(stat(store.filePath), { code: 'ENOENT' });

    await store.update((snapshot) => {
      const created = createClowder(snapshot, { name: 'Dev', members: [{ catId: 'mochi' }] }, context());
      return { snapshot: created.snapshot, result: created.clowder };
    });
    const reopened = new FileDirectoryStore(store.filePath);
    const persisted = await reopened.read();
    assert.equal(persisted.schemaVersion, 1);
    assert.deepEqual(persisted.clowders.map((clowder) => clowder.name), ['Dev']);
    assert.deepEqual(persisted.clowderMemberships.map((member) => member.catId), ['mochi']);
  });
});

test('the store leaves an unreadable or newer file untouched and refuses to write', async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, 'chat-state.local.directory.json');
    const store = new FileDirectoryStore(file);
    const create = (snapshot) => ({ snapshot: createClowder(snapshot, { name: 'Dev' }, context()).snapshot, result: null });

    await writeFile(file, '{ not json');
    await assert.rejects(store.read(), { code: 'directory_unreadable' });
    await assert.rejects(store.update(create), { code: 'directory_unreadable' });
    assert.equal(await readFile(file, 'utf8'), '{ not json');

    const dangling = JSON.stringify({ ...createEmptyDirectorySnapshot(NOW.toISOString()), clowderMemberships: [
      { clowderId: 'gone', catId: 'mochi', role: 'member', status: 'formal', expiresAt: null, joinedAt: 'x', updatedAt: 'x' },
    ] });
    await writeFile(file, dangling);
    await assert.rejects(store.update(create), { code: 'directory_unreadable' });
    assert.equal(await readFile(file, 'utf8'), dangling);

    const newer = JSON.stringify({ ...createEmptyDirectorySnapshot(NOW.toISOString()), schemaVersion: 2 });
    await writeFile(file, newer);
    await assert.rejects(store.update(create), { code: 'directory_newer' });
    assert.equal(await readFile(file, 'utf8'), newer);
  });
});

test('a failed mutation writes nothing', async () => {
  await withTempDir(async (dir) => {
    const store = new FileDirectoryStore(path.join(dir, 'chat-state.local.directory.json'));
    await assert.rejects(store.update((snapshot) => ({
      snapshot: createClowder(snapshot, { name: '' }, context()).snapshot,
      result: null,
    })), { code: 'directory_name_required' });
    await assert.rejects(stat(store.filePath), { code: 'ENOENT' });
  });
});

test('Platform data reset removes the directory file, including beside a renamed state file', async () => {
  await withTempDir(async (dir) => {
    for (const base of ['chat-state.local.json', 'workspace.json']) {
      const chatStatePath = path.join(dir, 'platform', 'state', base);
      const directoryPath = deriveDirectoryStatePath(chatStatePath);
      await mkdir(path.dirname(directoryPath), { recursive: true });
      await writeFile(directoryPath, '{}');
      await removePlatformOwnedData(chatStatePath);
      await assert.rejects(stat(directoryPath), { code: 'ENOENT' }, base);
    }
  });
});

test('DELETE /api/cats/:id removes the Cat from every Clowder and Cattery', async () => {
  await withTempDir(async (dir) => {
    const chatStatePath = path.join(dir, 'platform', 'state', 'chat-state.local.json');
    const chatStore = new MemoryChatStore();
    let state = await chatStore.read();
    state = createCat(state, { name: 'Leaving', provider: 'claude' }, NOW);
    state = createCat(state, { name: 'Staying', provider: 'claude' }, NOW);
    const [leaving, staying] = state.cats.map((cat) => cat.id);
    await chatStore.write(state);

    const store = directoryStoreFor(chatStatePath);
    await store.update((snapshot) => {
      const ctx = context([leaving, staying]);
      let next = createCattery(snapshot, { name: 'Acme', members: [{ catId: leaving }, { catId: staying }] }, ctx).snapshot;
      next = createClowder(next, { name: 'Dev', parentCatteryId: 'cattery-1', members: [{ catId: leaving }, { catId: staying }] }, ctx).snapshot;
      return { snapshot: next, result: null };
    });

    const server = createServer({
      shared: {
        config: {
          host: '127.0.0.1',
          port: 0,
          runtimeBaseUrl: 'http://127.0.0.1:3110',
          runtimeApiKey: '',
          chatStatePath,
          runtimeDataDir: path.join(dir, 'runtime-data'),
        },
        runtimeClient: {
          async getHealth() { return { baseUrl: 'http://127.0.0.1:3110', reachable: true, status: 'ok', service: 'cats-runtime' }; },
          async getProviderConfig() { return {}; },
          async deleteSession(sessionId) { return { action: 'delete', sessionId, status: 'deleted' }; },
        },
        now: () => LATER,
      },
      chat: { chatStore },
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/cats/${leaving}`, { method: 'DELETE' });
      assert.equal(response.status, 200);
    } finally {
      server.close();
      await once(server, 'close');
    }

    const after = await new FileDirectoryStore(deriveDirectoryStatePath(chatStatePath)).read();
    assert.deepEqual(after.clowderMemberships.map((member) => member.catId), [staying]);
    assert.deepEqual(after.catteryMemberships.map((member) => member.catId), [staying]);
    assert.deepEqual(after.clowders.map((clowder) => clowder.name), ['Dev']);
  });
});
