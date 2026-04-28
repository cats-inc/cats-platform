import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { routePlatformFeatureFlagApi } from '../src/app/server/platformFeatureFlagRoutes.ts';
import {
  COMPANION_PROFILE_IA_FLAG,
} from '../src/shared/featureFlags.ts';
import {
  readPersistedPlatformFeatureFlags,
} from '../src/shared/featureFlagsStore.ts';
import {
  resolvePlatformFeatureFlagsPathFromChatState,
} from '../src/shared/platformPaths.ts';

interface ServerCtx {
  baseUrl: string;
  chatStatePath: string;
}

async function withFeatureFlagServer(fn: (ctx: ServerCtx) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cats-feature-flag-route-'));
  const chatStatePath = path.join(tempDir, 'platform', 'state', 'chat-state.local.json');
  const dependencies = {
    config: { chatStatePath },
  } as never;

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
    await fn({
      baseUrl: `http://127.0.0.1:${address.port}`,
      chatStatePath,
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('POST /api/platform/feature-flag returns 400 for missing or wrong-typed body fields', async () => {
  await withFeatureFlagServer(async ({ baseUrl }) => {
    const missingName = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: true }),
    });
    assert.equal(missingName.status, 400);

    const wrongValue = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: 'on' }),
    });
    assert.equal(wrongValue.status, 400);
  });
});

test('POST /api/platform/feature-flag returns 404 for unknown flag names', async () => {
  await withFeatureFlagServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'cats.bogus', value: true }),
    });
    assert.equal(response.status, 404);
    const payload = await response.json() as { error: { code: string } };
    assert.equal(payload.error.code, 'unknown_flag');
  });
});

test('POST /api/platform/feature-flag persists a development write and returns the coerced map', async () => {
  await withFeatureFlagServer(async ({ baseUrl, chatStatePath }) => {
    const response = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: true }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      name: string;
      previousValue: boolean | null;
      nextValue: boolean;
      featureFlags: Record<string, boolean>;
    };
    assert.equal(payload.name, COMPANION_PROFILE_IA_FLAG);
    assert.equal(payload.previousValue, null);
    assert.equal(payload.nextValue, true);
    assert.equal(payload.featureFlags[COMPANION_PROFILE_IA_FLAG], true);

    // Verify the write actually landed on disk under the right path.
    const persisted = await readPersistedPlatformFeatureFlags(
      resolvePlatformFeatureFlagsPathFromChatState(chatStatePath),
    );
    assert.equal(persisted[COMPANION_PROFILE_IA_FLAG], true);
  });
});

test('POST /api/platform/feature-flag preserves other flags on a single-flag update', async () => {
  await withFeatureFlagServer(async ({ baseUrl, chatStatePath }) => {
    // Seed two known flags via two writes (the second overwrites only its own).
    await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: true }),
    });
    const response = await fetch(`${baseUrl}/api/platform/feature-flag`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: COMPANION_PROFILE_IA_FLAG, value: false }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      previousValue: boolean | null;
      nextValue: boolean;
    };
    assert.equal(payload.previousValue, true);
    assert.equal(payload.nextValue, false);

    const persisted = await readPersistedPlatformFeatureFlags(
      resolvePlatformFeatureFlagsPathFromChatState(chatStatePath),
    );
    assert.equal(persisted[COMPANION_PROFILE_IA_FLAG], false);
  });
});

test('GET /api/platform/feature-flag is rejected with 405', async () => {
  await withFeatureFlagServer(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/api/platform/feature-flag`, { method: 'GET' });
    assert.equal(response.status, 405);
  });
});
