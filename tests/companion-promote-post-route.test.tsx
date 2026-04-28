import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { COMPANION_PROFILE_POST_METADATA_KEYS } from '../src/products/chat/companion/profileReadModel.ts';
import { routeCompanionBoxApi } from '../src/products/chat/api/companionBoxRoutes.ts';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/memoryStore.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createCat } from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';

interface ServerCtx {
  baseUrl: string;
  catId: string;
  store: MemoryCompanionBoxStore;
}

async function withCompanionServer(fn: (ctx: ServerCtx) => Promise<void>): Promise<void> {
  const initialState = createDefaultChatState();
  const stateWithCat = createCat(initialState, { name: 'Mochi', provider: 'claude' }, new Date('2026-04-28T00:00:00.000Z'));
  const catId = stateWithCat.cats[0]!.id;
  const store = new MemoryCompanionBoxStore();
  await store.getBox(catId);
  const chatStore = new MemoryChatStore(stateWithCat);

  const dependencies = {
    config: { chatStatePath: '/test/chat-state.json' },
    chatStore,
    companionStore: store,
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
      store,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('POST /api/cats/:catId/companion-box/posts creates a derived record carrying profileSurface=post', async () => {
  await withCompanionServer(async ({ baseUrl, catId, store }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: { type: 'source', id: 's-photo-1' },
          title: 'Two days at the dome',
          body: 'concert recap',
          tags: ['#concert'],
          mediaRefs: [{ kind: 'source', id: 's-photo-1' }],
          promotedAt: '2026-04-28T01:00:00.000Z',
        }),
      },
    );
    assert.equal(response.status, 201);
    const payload = await response.json() as {
      derived: { id: string; metadata: Record<string, unknown> };
      updated: boolean;
    };
    assert.equal(payload.updated, false);
    assert.equal(
      payload.derived.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.surface],
      'post',
    );
    const persisted = await store.listDerived(catId);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.id, payload.derived.id);
  });
});

test('POST /api/cats/:catId/companion-box/posts re-promote on the same origin returns 200 and updates the existing record', async () => {
  await withCompanionServer(async ({ baseUrl, catId }) => {
    const url = `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`;
    const headers = { 'content-type': 'application/json' };
    const first = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        origin: { type: 'source', id: 's-photo-1' },
        title: 'First',
        mediaRefs: [],
        promotedAt: '2026-04-28T01:00:00.000Z',
      }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        origin: { type: 'source', id: 's-photo-1' },
        title: 'Updated',
        mediaRefs: [],
        promotedAt: '2026-04-28T02:00:00.000Z',
      }),
    });
    assert.equal(second.status, 200);
    const payload = await second.json() as { derived: { title: string }; updated: boolean };
    assert.equal(payload.updated, true);
    assert.equal(payload.derived.title, 'Updated');
  });
});

test('POST /api/cats/:catId/companion-box/posts rejects empty title with title_required', async () => {
  await withCompanionServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: { type: 'source', id: 's-photo-1' },
          title: '   ',
          mediaRefs: [],
          promotedAt: '2026-04-28T01:00:00.000Z',
        }),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'title_required');
  });
});

test('POST /api/cats/:catId/companion-box/posts rejects bad origin type', async () => {
  await withCompanionServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: { type: 'mystery', id: 's-photo-1' },
          title: 'has title',
          mediaRefs: [],
        }),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'invalid_origin_type');
  });
});

test('GET /api/cats/:catId/companion-box/posts is rejected with 405', async () => {
  await withCompanionServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`,
      { method: 'GET' },
    );
    assert.equal(response.status, 405);
  });
});
