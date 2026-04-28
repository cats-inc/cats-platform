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
  postId: string;
  store: MemoryCompanionBoxStore;
}

async function withPromotedPostServer(
  fn: (ctx: ServerCtx) => Promise<void>,
): Promise<void> {
  const initialState = createDefaultChatState();
  const stateWithCat = createCat(
    initialState,
    { name: 'Mochi', provider: 'claude' },
    new Date('2026-04-28T00:00:00.000Z'),
  );
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
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const promote = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          origin: { type: 'source', id: 's-photo' },
          title: 'Test post',
          mediaRefs: [],
          promotedAt: '2026-04-28T01:00:00.000Z',
        }),
      },
    );
    assert.equal(promote.status, 201);
    const promotePayload = await promote.json() as { derived: { id: string } };
    const postId = promotePayload.derived.id;

    await fn({ baseUrl, catId, postId, store });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('PATCH .../posts/:postId/status flips a post to removed and persists', async () => {
  await withPromotedPostServer(async ({ baseUrl, catId, postId, store }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts/${encodeURIComponent(postId)}/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      },
    );
    assert.equal(response.status, 200);
    const persisted = await store.listDerived(catId);
    assert.equal(
      persisted[0]?.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.status],
      'removed',
    );
  });
});

test('PATCH .../posts/:postId/status with status=active flips a removed post back', async () => {
  await withPromotedPostServer(async ({ baseUrl, catId, postId, store }) => {
    await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts/${encodeURIComponent(postId)}/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      },
    );
    await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts/${encodeURIComponent(postId)}/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      },
    );
    const persisted = await store.listDerived(catId);
    assert.equal(
      persisted[0]?.metadata[COMPANION_PROFILE_POST_METADATA_KEYS.status],
      'active',
    );
  });
});

test('PATCH .../posts/:postId/status rejects an unknown status value', async () => {
  await withPromotedPostServer(async ({ baseUrl, catId, postId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts/${encodeURIComponent(postId)}/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'whatever' }),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'invalid_post_status');
  });
});

test('PATCH .../posts/:postId/status returns 404 for an unknown post id', async () => {
  await withPromotedPostServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/posts/d-bogus/status`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'removed' }),
      },
    );
    assert.equal(response.status, 404);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'profile_post_not_found');
  });
});
