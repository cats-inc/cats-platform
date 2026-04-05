import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendPlatformOnboardingEvent,
  readPlatformOnboardingHistory,
  resolvePlatformOnboardingHistoryPath,
} from '../dist-server/shared/platformOnboardingHistory.js';

test('platform onboarding history persists bounded product-owned events beside chat-state.json', async () => {
  const workingDir = await mkdtemp(path.join(tmpdir(), 'cats-onboarding-history-'));
  const chatStatePath = path.join(workingDir, 'platform', 'state', 'chat-state.local.json');

  await appendPlatformOnboardingEvent(chatStatePath, {
    now: new Date('2026-03-31T01:00:00.000Z'),
    attemptId: 'attempt-alpha',
    kind: 'setup_opened',
    status: 'info',
    summary: 'Packaged platform setup was opened.',
    context: {
      route: '/setup',
    },
  });
  await appendPlatformOnboardingEvent(chatStatePath, {
    now: new Date('2026-03-31T01:01:00.000Z'),
    attemptId: 'attempt-alpha',
    kind: 'runtime_apply_confirmed',
    status: 'ok',
    summary: 'Runtime apply completed for claude.',
    context: {
      providers: ['claude'],
    },
  });

  const payload = await readPlatformOnboardingHistory(chatStatePath);
  assert.equal(payload.attemptId, 'attempt-alpha');
  assert.equal(payload.events.length, 2);
  assert.equal(payload.events[0].kind, 'runtime_apply_confirmed');
  assert.equal(payload.historyPath, resolvePlatformOnboardingHistoryPath(chatStatePath));

  const persisted = JSON.parse(await readFile(payload.historyPath, 'utf8'));
  assert.equal(persisted.activeAttemptId, 'attempt-alpha');
  assert.equal(persisted.events.length, 2);
});
