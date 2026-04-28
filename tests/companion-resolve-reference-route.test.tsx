import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { routeCompanionBoxApi } from '../src/products/chat/api/companionBoxRoutes.ts';
import { MemoryCompanionBoxStore } from '../src/products/chat/state/companion-box/memoryStore.ts';
import { createDefaultChatState } from '../src/products/chat/state/defaults.ts';
import { createCat } from '../src/products/chat/state/model/index.ts';
import { MemoryChatStore } from '../src/products/chat/state/store.ts';
import { ensurePlatformScopeId, resolvePlatformScopeIdPathFromChatState } from '../src/shared/platformScopeId.ts';

interface ServerCtx {
  baseUrl: string;
  catId: string;
  scopeId: string;
}

async function withCompanionResolveServer(
  fn: (ctx: ServerCtx) => Promise<void>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-companion-resolve-'));
  try {
    const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
    const initialState = createDefaultChatState();
    const stateWithCat = createCat(
      initialState,
      { name: 'Mochi', provider: 'claude' },
      new Date('2026-04-28T00:00:00.000Z'),
    );
    const catId = stateWithCat.cats[0]!.id;
    const store = new MemoryCompanionBoxStore();
    await store.getBox(catId);
    await store.ingestSource(catId, {
      kind: 'image',
      storageMode: 'uploaded_copy',
      title: 'Beach snap',
      mimeType: 'image/jpeg',
      originalFileName: 'beach.jpg',
    });
    const sources = await store.listSources(catId);
    const sourceId = sources[0]!.id;
    const chatStore = new MemoryChatStore(stateWithCat);

    const dependencies = {
      config: { chatStatePath },
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
      const scopeId = await ensurePlatformScopeId({
        filePath: resolvePlatformScopeIdPathFromChatState(chatStatePath),
      });
      await fn({
        baseUrl: `http://127.0.0.1:${address.port}`,
        catId,
        scopeId,
      });
      void sourceId; // expose for future tests
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('resolves an available photo reference into the live preview envelope', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId, scopeId }) => {
    const sourcesResponse = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/sources`,
    );
    const { sources } = await sourcesResponse.json() as {
      sources: Array<{ id: string }>;
    };
    const sourceId = sources[0]!.id;
    const reference = `cats://companion/v1/${scopeId}/${catId}/photo/${sourceId}`;
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referenceText: reference }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      parse: { status: 'parsed' };
      preview: {
        availability: string;
        title: string;
        catName: string;
        openRoute: string | null;
      };
    };
    assert.equal(payload.parse.status, 'parsed');
    assert.equal(payload.preview.availability, 'available');
    assert.equal(payload.preview.title, 'Beach snap');
    assert.equal(payload.preview.catName, 'Mochi');
    assert.match(
      payload.preview.openRoute ?? '',
      /\/chat\/cats\/[^/]+\/companion\/photos\//u,
    );
  });
});

test('a reference for an unknown source resolves as missing without throwing', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId, scopeId }) => {
    const reference = `cats://companion/v1/${scopeId}/${catId}/photo/s-missing`;
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referenceText: reference }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      preview: { availability: string };
    };
    assert.equal(payload.preview.availability, 'missing');
  });
});

test('a reference whose scopeId differs from the workspace resolves as inaccessible', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId }) => {
    const reference = `cats://companion/v1/foreign-scope/${catId}/photo/whatever`;
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referenceText: reference }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      preview: { availability: string };
    };
    assert.equal(payload.preview.availability, 'inaccessible');
  });
});

test('an unsupported version short-circuits with the parse status only', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId, scopeId }) => {
    const reference = `cats://companion/v2/${scopeId}/${catId}/photo/s-1`;
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referenceText: reference }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      parse: { status: string; version?: string };
      preview?: unknown;
    };
    assert.equal(payload.parse.status, 'unsupported_version');
    assert.equal(payload.preview, undefined);
  });
});

test('a reference whose catId does not match the route cat is rejected', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId, scopeId }) => {
    const reference = `cats://companion/v1/${scopeId}/another-cat/photo/s-1`;
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ referenceText: reference }),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'reference_cat_mismatch');
  });
});

test('missing referenceText body rejects with invalid_reference_text', async () => {
  await withCompanionResolveServer(async ({ baseUrl, catId }) => {
    const response = await fetch(
      `${baseUrl}/api/cats/${encodeURIComponent(catId)}/companion-box/resolve-reference`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'invalid_reference_text');
  });
});
