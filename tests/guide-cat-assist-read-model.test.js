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
  writeGuideCatAssistConfig,
} from '../build/server/shared/guideCatAssistStore.js';
import { resolveChatGuideCatAssistReadModel } from '../build/server/products/chat/api/guideCatAssist.js';
import { createDefaultChatState } from '../build/server/products/chat/state/defaults.js';
import { createAppShell } from '../build/server/products/chat/state/shell.js';

test('chat guide cat assist read model falls back to deterministic baseline when cache is missing', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-read-model-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  const readModel = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCatExists: false,
    runtimeReachable: false,
  });

  assert.equal(readModel.lobby.renderSource, 'deterministic');
  assert.equal(readModel.lobby.cacheHit, false);
  assert.equal(readModel.lobby.refreshEligible, false);
  assert.equal(readModel.lobby.bundle.scope.surfaceId, 'lobby');
  assert.equal(readModel.newChatByMode.solo.renderSource, 'deterministic');
  assert.equal(readModel.newChatByMode.direct.bundle.scope.surfaceMode, 'direct');
  assert.match(
    readModel.newChatByMode.direct.bundle.content.entryChips[0]?.prompt ?? '',
    /this Cat/,
  );
});

test('chat guide cat assist read model prefers cache, respects overrides, and exposes refresh eligibility', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-assist-read-model-cache-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await writeGuideCatAssistConfig(chatStatePath, {
    schemaVersion: 1,
    updatedAt: '2026-04-17T12:00:00.000Z',
    disabledSurfaceKeys: [GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewGroup],
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
    guideCatExists: true,
    runtimeReachable: true,
  });

  assert.equal(readModel.lobby.renderSource, 'cache');
  assert.equal(readModel.lobby.stale, true);
  assert.equal(readModel.lobby.refreshEligible, true);
  assert.equal(readModel.lobby.bundle.content.greeting, 'Override lobby greeting');
  assert.equal(readModel.newChatByMode.group.surfaceDisabled, true);
  assert.equal(readModel.newChatByMode.group.refreshEligible, false);
});

test('createAppShell carries guide cat assist read models into lobby and chat payloads', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-guide-cat-app-shell-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');
  const config = loadConfig({
    CATS_PLATFORM_DIR: path.join(workingDir, 'platform'),
  });

  const guideCatAssist = await resolveChatGuideCatAssistReadModel({
    chatStatePath,
    guideCatExists: false,
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
      newChatAssist: guideCatAssist.newChatByMode,
    },
  );

  assert.equal(payload.lobby.guideCatAssist?.scopeKey, GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.lobbyDefault);
  assert.equal(
    payload.chat.newChatAssist?.parallel.scopeKey,
    GUIDE_CAT_ASSIST_V1_SCOPE_KEYS.chatNewParallel,
  );
});
