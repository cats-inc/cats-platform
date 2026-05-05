import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../build/server/config.js';
import {
  GUIDE_CAT_ASSIST_V1_SCOPE_KEYS,
} from '../build/server/shared/guideCatAssist.js';
import {
  upsertGuideCatAssistBundle,
  readGuideCatAssistCache,
  writeGuideCatAssistConfig,
} from '../build/server/shared/guideCatAssistStore.js';
import {
  refreshGuideCatAssistEligibleScopes,
  resolveChatGuideCatAssistReadModel,
} from '../build/server/products/chat/api/guideCatAssist.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createAppShell } from '../build/server/products/chat/state/shell.js';

const TEST_GUIDE_CAT = {
  id: 'guide-cat-primary',
  name: 'Catlas',
  status: 'active',
  executionTarget: {
    provider: 'claude',
    instance: null,
    model: 'claude-sonnet',
  },
  modelSelection: null,
  createdAt: '2026-04-17T10:00:00.000Z',
  updatedAt: '2026-04-17T10:00:00.000Z',
};

test('chat guide cat assist read model falls back to deterministic baseline when cache is missing', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-read-model-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  const readModel = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCat: null,
    runtimeReachable: false,
  });

  assert.equal(readModel.lobby.renderSource, 'deterministic');
  assert.equal(readModel.lobby.cacheHit, false);
  assert.equal(readModel.lobby.refreshEligible, false);
  assert.equal(readModel.lobby.bundle.scope.surfaceId, 'lobby');
  // +New chat is a single scope (`chat:new:default`) — composer mode is
  // renderer state, not a cache axis. Deterministic baseline ships an
  // empty chip array; runtime-origin chips are the only kind the
  // renderer ever displays.
  assert.equal(readModel.newChat.renderSource, 'deterministic');
  assert.equal(readModel.newChat.bundle.scope.surfaceId, 'chat:new');
  assert.equal(readModel.newChat.bundle.scope.surfaceMode, 'default');
  assert.equal(readModel.newChat.bundle.content.entryChips.length, 0);
  assert.equal(readModel.newCode.bundle.scope.surfaceId, 'code:new');
  assert.equal(readModel.newCode.bundle.content.entryChips.length, 5);
});

test('chat guide cat assist read model prefers cache, respects overrides, and exposes refresh eligibility', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-read-model-cache-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await writeGuideCatAssistConfig(chatStatePath, {
    schemaVersion: 1,
    updatedAt: '2026-04-17T12:00:00.000Z',
    disabledSurfaceKeys: [GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault],
    deterministicSeed: 'seed-42',
    curatedOverrides: {
      [GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault]: {
        greeting: 'Override lobby greeting',
        entryChips: [],
      },
    },
    refreshPreferences: {
      runtimeRefreshEnabled: true,
      defaultTtlMs: null,
    },
  });

  await upsertGuideCatAssistBundle(chatStatePath, {
    bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    scope: {
      surfaceId: 'lobby',
      surfaceMode: 'default',
      audienceState: 'default',
    },
    content: {
      greeting: 'Cached lobby greeting',
      entryChips: [],
    },
    provenance: {
      originMode: 'runtime',
      refreshContextHash: 'gca:v1:cached-lobby',
      missionId: 'mission-123',
      runId: 'run-456',
    },
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: '2024-04-17T12:05:00.000Z',
      lastRefreshStatus: 'ok',
    },
  });

  const readModel = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCat: TEST_GUIDE_CAT,
    ownerDisplayName: 'Owner',
    runtimeReachable: true,
  });

  assert.equal(readModel.lobby.renderSource, 'cache');
  assert.equal(readModel.lobby.stale, true);
  assert.equal(readModel.lobby.refreshEligible, true);
  assert.equal(readModel.lobby.bundle.content.greeting, 'Override lobby greeting');
  assert.equal(readModel.newChat.surfaceDisabled, true);
  assert.equal(readModel.newChat.refreshEligible, false);
});

test('createAppShell carries guide cat assist read models into lobby and chat payloads', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-app-shell-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');
  const config = loadConfig({
    CATS_PLATFORM_DIR: path.join(workingDir, 'platform'),
  });

  const guideCatAssist = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCat: null,
    runtimeReachable: false,
  });
  const payload = createAppShell(
    config,
    {
      baseUrl: 'http://127.0.0.1:3110',
      reachable: false,
      status: 'unavailable',
      service: 'cats-runtime',
      error: 'offline',
    },
    createDefaultChatState(),
    new Date('2026-04-17T12:00:00.000Z'),
    {
      setupCompleteAt: null,
      ownerDisplayName: 'Owner',
      ownerAvatarColor: null,
      lobbyGuideCatAssist: guideCatAssist.lobby,
      newChatAssist: guideCatAssist.newChat,
      codeGuideCatAssist: guideCatAssist.newCode,
    },
  );

  assert.equal(payload.lobby.guideCatAssist?.scopeKey, GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault);
  assert.equal(
    payload.chat.newChatAssist?.scopeKey,
    GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault,
  );
  assert.equal(
    payload.guideCatAssist?.codeNewDraft?.scopeKey,
    GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.codeNewDefault,
  );
});

test('chat guide cat assist treats refreshContextHash mismatches as stale even before TTL expiry', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-context-hash-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await upsertGuideCatAssistBundle(chatStatePath, {
    bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    scope: {
      surfaceId: 'lobby',
      surfaceMode: 'default',
      audienceState: 'default',
    },
    content: {
      greeting: 'Fresh cached lobby greeting',
      entryChips: [],
    },
    provenance: {
      originMode: 'runtime',
      refreshContextHash: 'gca:v1:stale-context',
      missionId: 'mission-123',
      runId: 'run-456',
    },
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: '2026-04-18T12:05:00.000Z',
      lastRefreshStatus: 'ok',
    },
  });

  const readModel = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCat: {
      ...TEST_GUIDE_CAT,
      name: 'Renamed Catlas',
    },
    ownerDisplayName: 'Owner',
    runtimeReachable: true,
  });

  assert.equal(readModel.lobby.renderSource, 'cache');
  assert.equal(readModel.lobby.cacheHit, true);
  assert.equal(readModel.lobby.stale, true);
  assert.equal(readModel.lobby.refreshEligible, true);
});

test('chat guide cat assist ignores cached bundles when no Guide Cat is configured', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-no-guide-cat-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await upsertGuideCatAssistBundle(chatStatePath, {
    bundleId: GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault,
    scope: {
      surfaceId: 'lobby',
      surfaceMode: 'default',
      audienceState: 'default',
    },
    content: {
      greeting: 'Cached lobby greeting that should stay hidden',
      entryChips: [],
    },
    provenance: {
      originMode: 'runtime',
      refreshContextHash: 'gca:v1:old-guide-cat',
      missionId: 'mission-123',
      runId: 'run-456',
    },
    freshness: {
      generatedAt: '2026-04-17T12:00:00.000Z',
      expiresAt: '2026-04-18T12:05:00.000Z',
      lastRefreshStatus: 'ok',
    },
  });

  const readModel = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCat: null,
    runtimeReachable: false,
  });

  assert.equal(readModel.lobby.cacheHit, true);
  assert.equal(readModel.lobby.renderSource, 'deterministic');
  assert.notEqual(
    readModel.lobby.bundle.content.greeting,
    'Cached lobby greeting that should stay hidden',
  );
});

test('guide cat assist refresh can materialize eligible scopes into the local cache', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-refresh-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await refreshGuideCatAssistEligibleScopes({
    chatStatePath,
    guideCat: TEST_GUIDE_CAT,
    ownerDisplayName: 'Owner',
    runtimeReachable: true,
    now: new Date('2026-04-17T15:00:00.000Z'),
  });

  const cache = await readGuideCatAssistCache(chatStatePath);
  assert.equal(
    cache.bundles[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault]?.freshness.generatedAt,
    '2026-04-17T15:00:00.000Z',
  );
  assert.equal(
    cache.bundles[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewDefault]?.freshness.lastRefreshStatus,
    'skipped',
  );
  assert.ok(cache.bundles[GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.codeNewDefault]);
});
