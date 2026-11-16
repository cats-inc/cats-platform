import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { classifyPlatformAuthRoute } from '../build/server/app/server/authGatePolicy.js';
import { createServer } from '../build/server/app/server/index.js';
import { deriveDirectoryStatePath } from '../build/server/platform/directory/snapshot.js';
import { createCat } from '../build/server/products/chat/state/model/index.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';

const NOW = new Date('2026-11-16T08:00:00.000Z');

async function withDirectoryServer(callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cats-directory-routes-'));
  const chatStatePath = path.join(dir, 'platform', 'state', 'chat-state.local.json');
  const chatStore = new MemoryChatStore();
  let state = await chatStore.read();
  for (const name of ['Mochi', 'Tiger', 'Tofu']) state = createCat(state, { name, provider: 'claude' }, NOW);
  await chatStore.write(state);
  const cats = Object.fromEntries(state.cats.map((cat) => [cat.name.toLowerCase(), cat.id]));

  let tick = 0;
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
        async getHealth() { return { baseUrl: 'http://127.0.0.1:3110', reachable: false, status: 'unreachable', service: 'cats-runtime' }; },
        async getProviderConfig() { return {}; },
      },
      // Each request gets a later time, so creation order is observable.
      now: () => new Date(NOW.getTime() + (tick++) * 1000),
    },
    chat: { chatStore },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, route, body) => {
    const response = await fetch(`${base}${route}`, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await callback({ call, cats, chatStatePath });
  } finally {
    server.close();
    await once(server, 'close');
    await rm(dir, { recursive: true, force: true });
  }
}

test('directory routes are behind the auth gate in every phase', () => {
  for (const phase of ['pre_setup', 'post_setup', 'repair']) {
    for (const [method, pathname] of [
      ['GET', '/api/platform/directory'],
      ['POST', '/api/platform/clowders'],
      ['DELETE', '/api/platform/clowders/clowder-1'],
      ['POST', '/api/platform/clowders/clowder-1/members/cat-1/move'],
      ['POST', '/api/platform/catteries'],
      ['PATCH', '/api/platform/catteries/cattery-1/members/cat-1'],
    ]) {
      assert.equal(classifyPlatformAuthRoute({ phase, method, pathname }).access, 'protected', `${phase} ${method} ${pathname}`);
    }
  }
});

test('create, add, move, change and delete through the API; every answer is the whole directory', async () => {
  await withDirectoryServer(async ({ call, cats }) => {
    assert.deepEqual((await call('GET', '/api/platform/directory')).body, { directory: { clowders: [], catteries: [] } });

    const cattery = await call('POST', '/api/platform/catteries', {
      name: 'Furball Studio', domain: 'furball.studio', members: [{ catId: cats.mochi, role: 'owner' }],
    });
    assert.equal(cattery.status, 201);
    const catteryId = cattery.body.directory.catteries[0].id;

    const dev = await call('POST', '/api/platform/clowders', {
      name: 'Dev', parentCatteryId: catteryId,
      members: [{ catId: cats.mochi, role: 'lead' }, { catId: cats.tiger, status: 'temp', expiresAt: '2026-12-31' }],
    });
    assert.equal(dev.status, 201);
    const devId = dev.body.directory.clowders[0].id;
    const ops = await call('POST', '/api/platform/clowders', { name: 'Ops', parentCatteryId: catteryId });
    const opsId = ops.body.directory.clowders[1].id;
    const phoenix = await call('POST', '/api/platform/clowders', { name: 'Phoenix' });
    assert.equal(phoenix.body.directory.clowders[2].parentCatteryId, null);

    const again = await call('POST', `/api/platform/clowders/${devId}/members`, { catId: cats.mochi, status: 'external' });
    assert.equal(again.status, 200);
    assert.equal(again.body.directory.clowders[0].members.find((member) => member.catId === cats.mochi).status, 'formal');

    const moved = await call('POST', `/api/platform/clowders/${devId}/members/${cats.tiger}/move`, { toClowderId: opsId });
    assert.equal(moved.status, 200);
    const [devAfter, opsAfter] = moved.body.directory.clowders;
    assert.deepEqual(devAfter.members.map((member) => member.catId), [cats.mochi]);
    assert.deepEqual(opsAfter.members.map((member) => [member.catId, member.status, member.expiresAt]), [
      [cats.tiger, 'temp', '2026-12-31T00:00:00.000Z'],
    ]);

    const promoted = await call('PATCH', `/api/platform/clowders/${opsId}/members/${cats.tiger}`, { status: 'formal' });
    assert.deepEqual(promoted.body.directory.clowders[1].members[0].expiresAt, null);

    const renamed = await call('PATCH', `/api/platform/catteries/${catteryId}`, { name: 'Furball' });
    assert.equal(renamed.body.directory.catteries[0].name, 'Furball');

    const deleted = await call('DELETE', `/api/platform/catteries/${catteryId}`);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.directory.catteries, []);
    assert.deepEqual(deleted.body.directory.clowders.map((clowder) => [clowder.name, clowder.parentCatteryId, clowder.members.length]), [
      ['Dev', null, 1], ['Ops', null, 1], ['Phoenix', null, 0],
    ]);

    const removed = await call('DELETE', `/api/platform/clowders/${devId}`);
    assert.deepEqual(removed.body.directory.clowders.map((clowder) => clowder.name), ['Ops', 'Phoenix']);
  });
});

test('refusals carry their own codes and change nothing', async () => {
  await withDirectoryServer(async ({ call, cats }) => {
    const created = await call('POST', '/api/platform/clowders', { name: 'Dev' });
    const devId = created.body.directory.clowders[0].id;
    const cattery = await call('POST', '/api/platform/catteries', { name: 'Acme' });
    const catteryId = cattery.body.directory.catteries[0].id;

    const cases = [
      ['POST', '/api/platform/clowders', { name: '' }, 400, 'directory_name_required'],
      ['POST', '/api/platform/clowders', { name: 'X', members: [{ catId: 'ghost' }] }, 400, 'cat_not_found'],
      ['PATCH', `/api/platform/clowders/${devId}`, { parentCatteryId: catteryId }, 400, 'clowder_parent_fixed'],
      ['POST', `/api/platform/catteries/${catteryId}/members`, { catId: cats.tofu, status: 'temp' }, 400, 'cattery_temp_not_allowed'],
      ['DELETE', '/api/platform/clowders/clowder-missing', undefined, 404, 'clowder_not_found'],
      ['DELETE', `/api/platform/clowders/${devId}/members/${cats.tofu}`, undefined, 404, 'membership_not_found'],
      ['POST', `/api/platform/clowders/${devId}/members/${cats.tofu}/move`, {}, 400, 'bad_request'],
      ['POST', '/api/platform/clowders', [], 400, 'bad_request'],
    ];
    for (const [method, route, body, status, code] of cases) {
      const response = await call(method, route, body);
      assert.equal(response.status, status, `${method} ${route}`);
      assert.equal(response.body.error.code, code, `${method} ${route}`);
    }
    const directory = (await call('GET', '/api/platform/directory')).body.directory;
    assert.deepEqual(directory.clowders.map((clowder) => [clowder.name, clowder.members.length]), [['Dev', 0]]);
    assert.equal((await call('PUT', '/api/platform/directory')).status, 405);
  });
});

test('an unreadable directory file fails the Directory but not the app shell', async () => {
  await withDirectoryServer(async ({ call, chatStatePath }) => {
    const file = deriveDirectoryStatePath(chatStatePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{ broken');
    const read = await call('GET', '/api/platform/directory');
    assert.equal(read.status, 500);
    assert.equal(read.body.error.code, 'directory_unreadable');
    assert.equal((await call('POST', '/api/platform/clowders', { name: 'Dev' })).body.error.code, 'directory_unreadable');
    assert.equal(await readFile(file, 'utf8'), '{ broken');

    const shell = await call('GET', '/api/app-shell');
    assert.equal(shell.status, 200);
    assert.deepEqual(shell.body.lobby.clowders, []);
    assert.deepEqual(shell.body.lobby.catteries, []);
  });
});

test('the app shell lobby summarizes groups; a membership whose Cat is gone is left out', async () => {
  await withDirectoryServer(async ({ call, cats, chatStatePath }) => {
    const cattery = await call('POST', '/api/platform/catteries', {
      name: 'Acme', members: [{ catId: cats.mochi }, { catId: cats.tofu, status: 'external' }],
    });
    const catteryId = cattery.body.directory.catteries[0].id;
    await call('POST', '/api/platform/clowders', {
      name: 'Dev', parentCatteryId: catteryId, members: [{ catId: cats.mochi }, { catId: cats.tiger }],
    });

    // A Cat deleted while the directory could not be written leaves a membership behind.
    const file = deriveDirectoryStatePath(chatStatePath);
    const snapshot = JSON.parse(await readFile(file, 'utf8'));
    snapshot.clowderMemberships.push({ ...snapshot.clowderMemberships[0], catId: 'cat-gone' });
    await writeFile(file, JSON.stringify(snapshot));

    const shell = await call('GET', '/api/app-shell');
    assert.deepEqual(shell.body.lobby.catteries.map(({ name, memberCount, clowderCount, catCount, avatarUrl }) =>
      ({ name, memberCount, clowderCount, catCount, avatarUrl })), [
      { name: 'Acme', memberCount: 2, clowderCount: 1, catCount: 3, avatarUrl: null },
    ]);
    assert.deepEqual(shell.body.lobby.clowders.map(({ name, parentCatteryId, catCount, memberCount }) =>
      ({ name, parentCatteryId, catCount, memberCount })), [
      { name: 'Dev', parentCatteryId: catteryId, catCount: 2, memberCount: 2 },
    ]);
    const directory = (await call('GET', '/api/platform/directory')).body.directory;
    assert.deepEqual(directory.clowders[0].members.map((member) => member.catId), [cats.mochi, cats.tiger]);
  });
});
