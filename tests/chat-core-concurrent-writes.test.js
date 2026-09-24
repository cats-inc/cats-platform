import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import test from 'node:test';

import { createCat } from '../build/server/products/chat/state/model/index.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { MemoryChatStore } from '../build/server/products/chat/state/store.js';
import { routeOwnerMemoryApi } from '../build/server/products/chat/api/memory/ownerRoutes.js';
import { routeCatMemoryApi } from '../build/server/products/chat/api/memory/catRoutes.js';
import { routeBotBindingApi } from '../build/server/products/chat/api/botBindingRoutes.js';
import { upsertCoreTask, upsertCoreRun, removeDurableMemory } from '../build/server/core/model/index.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Pause before persistence, outside the store's atomic section, so another
// request can commit while this request holds its earlier read snapshot.
class CoordinatedStore extends MemoryChatStore {
  pauses = new Map();
  releases = [];
  pauseNext(operation) {
    const entered = deferred();
    const released = deferred();
    this.pauses.set(operation, { entered, released });
    this.releases.push(released.resolve);
    return { entered: entered.promise, release: released.resolve };
  }
  async pause(operation) {
    const gate = this.pauses.get(operation);
    if (!gate) return;
    this.pauses.delete(operation);
    gate.entered.resolve();
    await gate.released.promise;
  }
  async readCore() {
    const core = await super.readCore();
    await this.pause('readCore');
    return core;
  }
  async writeCore(core) {
    await this.pause('persistCore');
    return super.writeCore(core);
  }
  async updateCore(mutator) {
    await this.pause('persistCore');
    return super.updateCore(mutator);
  }
}

async function fixture(t) {
  const state = createCat(createDefaultChatState(), { name: 'Companion', provider: 'claude' });
  const store = new CoordinatedStore(state);
  const catId = state.cats[0].id;
  const flush = async () => ({ scope: 'owner', subjectId: 'actor-owner', persistedCount: 0,
    removedRecordIds: [], payload: { sourceScopeKeys: [], persistedRecords: [] } });
  const dependencies = { chatStore: store,
    memoryService: { flushOwnerProfile: flush, flushCompanionBox: flush } };
  const server = createServer(async (req, res) => {
    const context = { request: req, response: res, method: req.method,
      url: new URL(req.url, 'http://127.0.0.1'), dependencies };
    try {
      if (await routeOwnerMemoryApi(context) || await routeCatMemoryApi(context)
        || await routeBotBindingApi(context)) return;
      res.writeHead(404).end();
    } catch (error) {
      res.writeHead(500).end(JSON.stringify({ error: String(error) }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    store.releases.forEach(release => release());
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  function send(method, route, body, delayBody = false) {
    const serialized = body === undefined ? '' : JSON.stringify(body);
    const req = request(`${baseUrl}${route}`, { method, headers: {
      'content-type': 'application/json', 'content-length': Buffer.byteLength(serialized),
    } });
    const response = (async () => {
      const [res] = await once(req, 'response');
      const chunks = [];
      for await (const chunk of res) chunks.push(chunk);
      return { status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) };
    })();
    // Attach rejection handling while the test intentionally holds the request.
    void response.catch(() => {});
    req.flushHeaders();
    if (!delayBody) req.end(serialized);
    return { response, finish: () => req.end(serialized) };
  }
  async function json(method, route, body) { return send(method, route, body).response; }
  return { store, catId, send, json };
}

async function addConcurrentWork(store) {
  const core = await store.updateCore(current => {
    const withTask = upsertCoreTask(current, { id: 'task-concurrent-work',
      title: 'Owner-confirmed collaboration', status: 'in_progress',
      metadata: { source: 'work-collaboration' } }).core;
    return upsertCoreRun(withTask, { id: 'run-concurrent-work', taskId: 'task-concurrent-work',
      title: 'Implementation', status: 'running', metadata: { source: 'work-collaboration' } }).core;
  });
  return { tasks: core.tasks, runs: core.runs };
}

async function assertWorkPreserved(store, expected) {
  const core = await store.readCore();
  assert.deepEqual(core.tasks, expected.tasks);
  assert.deepEqual(core.runs, expected.runs);
}

for (const scope of ['owner', 'cat']) {
  test(`${scope} memory delayed PUT preserves concurrent Work Task and Run records`, { timeout: 5000 }, async t => {
    const h = await fixture(t);
    const route = scope === 'owner' ? '/api/owner/memory' : `/api/cats/${h.catId}/memory`;
    const created = await h.json('POST', route, { content: 'Original', category: 'fact' });
    assert.equal(created.status, 201);
    const gate = h.store.pauseNext('readCore');
    const pending = h.send('PUT', `${route}/${created.body.memory.id}`, { content: 'Updated' }, true);
    await gate.entered;
    const expected = await addConcurrentWork(h.store);
    gate.release();
    pending.finish();
    const updated = await pending.response;
    assert.equal(updated.status, 200);
    assert.equal(updated.body.memory.content, 'Updated');
    await assertWorkPreserved(h.store, expected);
  });

  test(`${scope} memory delayed PUT cannot resurrect a concurrently deleted memory`, { timeout: 5000 }, async t => {
    const h = await fixture(t);
    const route = scope === 'owner' ? '/api/owner/memory' : `/api/cats/${h.catId}/memory`;
    const created = await h.json('POST', route, { content: 'Original', category: 'fact' });
    const id = created.body.memory.id;
    const gate = h.store.pauseNext('readCore');
    const pending = h.send('PUT', `${route}/${id}`, { content: 'Resurrected' }, true);
    await gate.entered;
    await h.store.updateCore(core => removeDurableMemory(core, id));
    gate.release();
    pending.finish();
    const rejected = await pending.response;
    assert.equal(rejected.status, 404);
    assert.equal(rejected.body.error.code, 'memory_not_found');
    assert.equal((await h.store.readCore()).durableMemory.some(memory => memory.id === id), false);
  });

  for (const method of ['POST', 'DELETE']) {
    test(`${scope} memory ${method} preserves Work records committed before persistence`, { timeout: 5000 }, async t => {
      const h = await fixture(t);
      let route = scope === 'owner' ? '/api/owner/memory' : `/api/cats/${h.catId}/memory`;
      if (method === 'DELETE') {
        const created = await h.json('POST', route, { content: 'Original', category: 'fact' });
        route += `/${created.body.memory.id}`;
      }
      const gate = h.store.pauseNext('persistCore');
      const pending = h.send(method, route, method === 'POST' ? { content: 'Added', category: 'fact' } : undefined);
      await gate.entered;
      const expected = await addConcurrentWork(h.store);
      gate.release();
      assert.equal((await pending.response).status, method === 'POST' ? 201 : 200);
      await assertWorkPreserved(h.store, expected);
    });
  }
}

for (const method of ['POST', 'PATCH', 'DELETE']) {
  test(`bot binding ${method} preserves concurrent Work records and binding changes`, { timeout: 5000 }, async t => {
    const h = await fixture(t);
    const input = { platform: 'telegram', catId: h.catId, botName: 'First', botToken: 'test:first' };
    let route = '/api/bot-bindings';
    if (method !== 'POST') {
      const created = await h.json('POST', route, input);
      assert.equal(created.status, 201);
      route += `/${created.body.botBinding.id}`;
    }
    const gate = h.store.pauseNext('persistCore');
    const pending = h.send(method, route, method === 'POST' ? input : method === 'PATCH' ? { botName: 'Renamed' } : undefined);
    await gate.entered;
    const expected = await addConcurrentWork(h.store);
    const other = await h.json('POST', '/api/bot-bindings', { ...input, botName: 'Second', botToken: 'test:second' });
    assert.equal(other.status, 201);
    gate.release();
    const updated = await pending.response;
    assert.equal(updated.status, method === 'POST' ? 201 : 200);
    if (method === 'PATCH') assert.equal(updated.body.botBinding.botName, 'Renamed');
    await assertWorkPreserved(h.store, expected);
    const bindings = (await h.store.readCore()).botBindings;
    assert.ok(bindings.some(binding => binding.id === other.body.botBinding.id));
    assert.equal(bindings.length, method === 'DELETE' ? 1 : 2);
  });
}

test('bot binding token uniqueness uses the latest committed bindings', { timeout: 5000 }, async t => {
  const h = await fixture(t);
  const input = { platform: 'telegram', catId: h.catId, botName: 'Contender', botToken: 'test:shared' };
  const gate = h.store.pauseNext('persistCore');
  const pending = h.send('POST', '/api/bot-bindings', input);
  await gate.entered;
  const winner = await h.json('POST', '/api/bot-bindings', { ...input, botName: 'Winner' });
  assert.equal(winner.status, 201);
  gate.release();
  const rejected = await pending.response;
  assert.equal(rejected.status, 400);
  const bindings = (await h.store.readCore()).botBindings;
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].id, winner.body.botBinding.id);
});
