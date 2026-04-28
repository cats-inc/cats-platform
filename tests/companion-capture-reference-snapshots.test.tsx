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
import {
  ensurePlatformScopeId,
  resolvePlatformScopeIdPathFromChatState,
} from '../src/shared/platformScopeId.ts';
import { captureCompanionReferenceSnapshots } from '../src/products/chat/renderer/api/companion.ts';

interface ServerCtx {
  baseUrl: string;
  catId: string;
  scopeId: string;
  sourceId: string;
}

async function withFixture(fn: (ctx: ServerCtx) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-capture-snapshots-'));
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
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const previousFetch = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const target =
          typeof input === 'string'
            ? new URL(input, baseUrl).toString()
            : input instanceof URL
              ? new URL(input.href, baseUrl).toString()
              : new URL(input.url, baseUrl).toString();
        return previousFetch(target, init);
      }) as typeof fetch;
      try {
        const scopeId = await ensurePlatformScopeId({
          filePath: resolvePlatformScopeIdPathFromChatState(chatStatePath),
        });
        await fn({ baseUrl, catId, scopeId, sourceId });
      } finally {
        globalThis.fetch = previousFetch;
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('captures snapshots only for available references in the body', async () => {
  await withFixture(async ({ catId, scopeId, sourceId }) => {
    const body = `Look at cats://companion/v1/${scopeId}/${catId}/photo/${sourceId} and `
      + `cats://companion/v1/${scopeId}/${catId}/photo/s-missing too.`;
    const snapshots = await captureCompanionReferenceSnapshots(body, {
      capturedAt: '2026-04-28T01:00:00.000Z',
    });
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.title, 'Beach snap');
    assert.equal(snapshots[0]?.capturedAt, '2026-04-28T01:00:00.000Z');
    assert.match(snapshots[0]?.referenceText ?? '', /\/photo\//u);
  });
});

test('returns empty array when body has no companion references', async () => {
  await withFixture(async () => {
    const snapshots = await captureCompanionReferenceSnapshots('plain body');
    assert.deepEqual(snapshots, []);
  });
});

test('skips unsupported_version references silently', async () => {
  await withFixture(async ({ catId, scopeId }) => {
    const body = `cats://companion/v2/${scopeId}/${catId}/photo/p-1`;
    const snapshots = await captureCompanionReferenceSnapshots(body);
    assert.deepEqual(snapshots, []);
  });
});

test('skips inaccessible references (scope mismatch) silently', async () => {
  await withFixture(async ({ catId }) => {
    const body = `cats://companion/v1/foreign-scope/${catId}/photo/anywhere`;
    const snapshots = await captureCompanionReferenceSnapshots(body);
    assert.deepEqual(snapshots, []);
  });
});
