import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { routeCompanionBoxApi } from '../src/products/chat/api/companionBoxRoutes.ts';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/memoryStore.ts';
import { createMemoryCompanionActivityStore } from '../src/products/chat/companion/activityStore.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createCat } from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

interface ServerCtx {
  baseUrl: string;
  catId: string;
}

async function withCompanionActivityServer(
  fn: (ctx: ServerCtx) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-activity-'));
  try {
    const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
    const initialState = createDefaultChatState();
    const stateWithCat = createCat(
      initialState,
      { name: 'Mochi', provider: 'claude' },
      new Date('2026-04-28T00:00:00.000Z'),
    );
    const catId = stateWithCat.cats[0]!.id;
    const companionStore = new MemoryCompanionBoxStore();
    await companionStore.getBox(catId);
    const companionActivityStore = createMemoryCompanionActivityStore();
    const chatStore = new MemoryChatStore(stateWithCat);

    const dependencies = {
      config: { chatStatePath },
      chatStore,
      companionStore,
      companionActivityStore,
    } as never;

    const server = createServer(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const handled = await routeCompanionBoxApi({
        request,
        response,
        url,
        method: request.method ?? 'GET',
        dependencies,
      });
      if (!handled) {
        response.writeHead(404, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'not found' }));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address !== 'object') {
        throw new Error('failed to resolve test server address');
      }
      await fn({
        baseUrl: `http://127.0.0.1:${address.port}`,
        catId,
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('GET /companion-box/activity returns an empty projection when no events have been recorded', async () => {
  await withCompanionActivityServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/activity`,
    );
    assert.equal(response.status, 200);
    const body = await response.json() as { activity: { entries: unknown[]; olderHidden: boolean } };
    assert.deepEqual(body.activity, { entries: [], olderHidden: false });
  });
});

test('source create + delete round-trips through activity log and renders aggregated entries', async () => {
  await withCompanionActivityServer(async ({ baseUrl, catId }) => {
    const createRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/sources`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'note',
          storageMode: 'imported_copy',
          title: 'first note',
          textContent: 'hello',
        }),
      },
    );
    assert.equal(createRes.status, 201);
    const created = await createRes.json() as { source: { id: string } };

    const deleteRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/sources/${encodeURIComponent(created.source.id)}`,
      { method: 'DELETE' },
    );
    assert.equal(deleteRes.status, 200);

    const activityRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/activity`,
    );
    assert.equal(activityRes.status, 200);
    const activityBody = await activityRes.json() as {
      activity: {
        entries: Array<{ group: string; targetKind: string; count: number }>;
      };
    };
    const groups = activityBody.activity.entries.map((entry) => entry.group);
    assert.ok(groups.includes('source_added'), `expected source_added in ${JSON.stringify(groups)}`);
    assert.ok(groups.includes('source_removed'), `expected source_removed in ${JSON.stringify(groups)}`);
  });
});

test('memory create / delete / status update each emits its own activity entry', async () => {
  await withCompanionActivityServer(async ({ baseUrl, catId }) => {
    const createRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/memory`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: 'fact',
          content: 'first memory',
        }),
      },
    );
    assert.equal(createRes.status, 201);
    const created = await createRes.json() as { memory: { id: string } };

    const statusRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/memory/${encodeURIComponent(created.memory.id)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      },
    );
    assert.equal(statusRes.status, 200);

    const deleteRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/memory/${encodeURIComponent(created.memory.id)}`,
      { method: 'DELETE' },
    );
    assert.equal(deleteRes.status, 200);

    const activityRes = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/activity`,
    );
    const activityBody = await activityRes.json() as {
      activity: { entries: Array<{ group: string }> };
    };
    const groups = new Set(activityBody.activity.entries.map((entry) => entry.group));
    assert.ok(groups.has('memory_added'), `expected memory_added in ${[...groups].join(',')}`);
    assert.ok(groups.has('memory_updated'), `expected memory_updated in ${[...groups].join(',')}`);
    assert.ok(groups.has('memory_removed'), `expected memory_removed in ${[...groups].join(',')}`);
  });
});
