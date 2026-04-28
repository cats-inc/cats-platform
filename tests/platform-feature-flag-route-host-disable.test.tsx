import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { routePlatformFeatureFlagApi } from '../src/app/server/platformFeatureFlagRoutes.ts';
import { COMPANION_PROFILE_IA_FLAG } from '../src/shared/featureFlags.ts';

interface ServerCtx {
  baseUrl: string;
}

async function withFeatureFlagServer(fn: (ctx: ServerCtx) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-feature-flag-host-disable-'));
  const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
  const dependencies = { config: { chatStatePath } } as never;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const handled = await routePlatformFeatureFlagApi({
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
      throw new Error('server.address() returned a non-object');
    }
    await fn({ baseUrl: `http://127.0.0.1:${address.port}` });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('with CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS=1 the sidecar HTTP route returns 410', async () => {
  process.env.CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS = '1';
  try {
    await withFeatureFlagServer(async ({ baseUrl }) => {
      const response = await fetch(`${baseUrl}/api/platform/feature-flag`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: true }),
      });
      assert.equal(response.status, 410);
      const payload = await response.json() as { error: { code: string } };
      assert.equal(payload.error.code, 'feature_flag_writer_disabled');
    });
  } finally {
    delete process.env.CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS;
  }
});

test('without the env var the sidecar HTTP route remains the writer (development write succeeds)', async () => {
  delete process.env.CATS_PLATFORM_HOST_OWNS_FEATURE_FLAGS;
  await withFeatureFlagServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: true }),
    });
    assert.equal(response.status, 200);
  });
});
