import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  GUIDE_CAT_ASSIST_V1_SCOPE_KEYS,
  buildGuideCatAssistRefreshContextHash,
  createGuideCatAssistScopeKey,
  isGuideCatAssistBundleStale,
  parseGuideCatAssistScopeKey,
} from '../build/server/shared/guideCatAssist.js';
import {
  readGuideCatAssistBundle,
  readGuideCatAssistCache,
  readGuideCatAssistConfig,
  recordGuideCatAssistRefreshFailure,
  resolveGuideCatAssistCachePath,
  resolveGuideCatAssistConfigPath,
  upsertGuideCatAssistBundle,
  writeGuideCatAssistConfig,
} from '../build/server/shared/guideCatAssistStore.js';

test('guide cat assist store resolves canonical config and cache paths beside chat-state.local.json', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-paths-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  assert.equal(
    resolveGuideCatAssistConfigPath(chatStatePath),
    path.join(workingDir, 'platform', 'config', 'guide-cat-assist-config.json'),
  );
  assert.equal(
    resolveGuideCatAssistCachePath(chatStatePath),
    path.join(workingDir, 'platform', 'state', 'guide-cat-assist-cache.local.json'),
  );

  const config = await readGuideCatAssistConfig(chatStatePath);
  const cache = await readGuideCatAssistCache(chatStatePath);
  assert.deepEqual(config.disabledSurfaceKeys, []);
  assert.equal(config.deterministicSeed, null);
  assert.equal(config.refreshPreferences.runtimeRefreshEnabled, true);
  assert.deepEqual(cache.bundles, {});
  assert.deepEqual(cache.refreshFailures, {});
});

test('guide cat assist refresh context hash stays stable across object key order and scope parsing preserves chat:new ids', () => {
  const alphaHash = buildGuideCatAssistRefreshContextHash({
    scope: {
      surfaceId: 'chat:new',
      surfaceMode: 'solo',
      audienceState: 'default',
    },
    guideCat: {
      id: 'guide-cat-primary',
      name: 'Catlas',
      executionTarget: {
        provider: 'claude',
        instance: 'desk',
        model: 'sonnet',
      },
      modelSelection: {
        mode: 'manual',
        model: 'sonnet',
      },
    },
    ownerProfile: {
      displayName: 'Sammy',
    },
    assistTemplateRevision: 'v1-baseline',
  });
  const betaHash = buildGuideCatAssistRefreshContextHash({
    scope: {
      surfaceId: 'chat:new',
      surfaceMode: 'solo',
      audienceState: 'default',
    },
    guideCat: {
      id: 'guide-cat-primary',
      name: 'Catlas',
      executionTarget: {
        model: 'sonnet',
        provider: 'claude',
        instance: 'desk',
      },
      modelSelection: {
        model: 'sonnet',
        mode: 'manual',
      },
    },
    ownerProfile: {
      displayName: 'Sammy',
    },
    assistTemplateRevision: 'v1-baseline',
  });

  assert.equal(alphaHash, betaHash);
  assert.deepEqual(
    parseGuideCatAssistScopeKey(GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault),
    {
      surfaceId: 'chat:new',
      surfaceMode: 'default',
      audienceState: 'default',
    },
  );
});

test('guide cat assist store upserts bundle content and retains last-good bundle when refresh fails', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-store-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');
  const scope = {
    surfaceId: 'chat:new',
    surfaceMode: 'direct',
    audienceState: 'default',
  };
  const scopeKey = createGuideCatAssistScopeKey(scope);

  await recordGuideCatAssistRefreshFailure(chatStatePath, {
    scopeKey,
    failedAt: '2026-04-17T12:00:00.000Z',
    message: 'Runtime unavailable',
    code: 'RUNTIME_OFFLINE',
  });
  const initialFailureCache = await readGuideCatAssistCache(chatStatePath);
  assert.equal(initialFailureCache.refreshFailures[scopeKey]?.attempts, 1);

  await upsertGuideCatAssistBundle(chatStatePath, {
    bundleId: scopeKey,
    scope,
    content: {
      greeting: 'Ask this Cat for a focused update.',
      entryChips: [
        {
          id: 'direct-update',
          prompt: 'Ask this Cat for a focused update or recommendation on this task.',
        },
      ],
    },
    provenance: {
      originMode: 'deterministic',
      refreshContextHash: 'gca:v1:test-bundle',
      missionId: null,
      runId: null,
    },
    freshness: {
      generatedAt: '2026-04-17T12:01:00.000Z',
      expiresAt: '2026-04-18T12:01:00.000Z',
      lastRefreshStatus: 'ok',
    },
  });

  const storedBundle = await readGuideCatAssistBundle(chatStatePath, scope);
  assert.equal(storedBundle?.content.greeting, 'Ask this Cat for a focused update.');

  const postUpsertCache = await readGuideCatAssistCache(chatStatePath);
  assert.equal(postUpsertCache.refreshFailures[scopeKey], undefined);

  await recordGuideCatAssistRefreshFailure(chatStatePath, {
    scopeKey,
    failedAt: '2026-04-17T12:02:00.000Z',
    message: 'Refresh timed out',
    code: 'TIMEOUT',
  });

  const retainedBundle = await readGuideCatAssistBundle(chatStatePath, scopeKey);
  const retainedCache = await readGuideCatAssistCache(chatStatePath);
  assert.equal(retainedBundle?.content.entryChips.length, 1);
  assert.equal(retainedCache.refreshFailures[scopeKey]?.message, 'Refresh timed out');
  assert.equal(retainedCache.refreshFailures[scopeKey]?.attempts, 1);
});

test('guide cat assist config normalizes overrides and malformed cache bundles safely', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-normalize-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await writeGuideCatAssistConfig(chatStatePath, {
    schemaVersion: 999,
    updatedAt: '2026-04-17T12:00:00.000Z',
    disabledSurfaceKeys: ['  lobby:default:default  ', '', 'lobby:default:default'],
    deterministicSeed: ' guide-cat-seed ',
    curatedOverrides: {
      [GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault]: {
        greeting: 'Welcome back.',
        entryChips: [{
          id: 'resume',
          prompt: 'Resume your latest thread.',
          label: 'Resume',
        }],
      },
    },
    refreshPreferences: {
      runtimeRefreshEnabled: false,
      defaultTtlMs: 60_000,
    },
  });

  const config = await readGuideCatAssistConfig(chatStatePath);
  assert.deepEqual(config.disabledSurfaceKeys, ['lobby:default:default']);
  assert.equal(config.deterministicSeed, 'guide-cat-seed');
  assert.equal(config.refreshPreferences.runtimeRefreshEnabled, false);
  assert.equal(config.refreshPreferences.defaultTtlMs, 60_000);
  assert.equal(
    config.curatedOverrides[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault]?.entryChips[0]?.label,
    'Resume',
  );

  const malformedCachePath = resolveGuideCatAssistCachePath(chatStatePath);
  await mkdir(path.dirname(malformedCachePath), { recursive: true });
  await writeFile(malformedCachePath, JSON.stringify({
    schemaVersion: 999,
    updatedAt: '2026-04-17T12:00:00.000Z',
    bundles: {
      bad: {
        scope: {
          surfaceMode: 'default',
          audienceState: 'default',
        },
      },
    },
  }, null, 2));

  const cache = await readGuideCatAssistCache(chatStatePath);
  assert.deepEqual(cache.bundles, {});
});

test('guide cat assist stale check treats expired or malformed cache freshness as stale but keeps deterministic baselines fresh', async () => {
  assert.equal(isGuideCatAssistBundleStale({
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: '2026-04-18T12:00:00.000Z',
      lastRefreshStatus: 'ok',
    },
  }, new Date('2026-04-17T18:00:00.000Z')), false);

  assert.equal(isGuideCatAssistBundleStale({
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: '2026-04-17T12:00:00.000Z',
      lastRefreshStatus: 'ok',
    },
  }, new Date('2026-04-17T18:00:00.000Z')), true);

  assert.equal(isGuideCatAssistBundleStale({
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: 'not-a-timestamp',
      lastRefreshStatus: 'ok',
    },
  }, new Date('2026-04-17T18:00:00.000Z')), true);

  assert.equal(isGuideCatAssistBundleStale({
    freshness: {
      generatedAt: '1970-01-01T00:00:00.000Z',
      expiresAt: null,
      lastRefreshStatus: 'never',
    },
  }, new Date('2026-04-17T18:00:00.000Z')), false);

  assert.equal(isGuideCatAssistBundleStale({
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: null,
      lastRefreshStatus: 'ok',
    },
  }, new Date('2026-04-17T18:00:00.000Z')), true);
});
