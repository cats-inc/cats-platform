import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { readPersistedSetupCompletionState } from '../dist-electron/persistedSetupState.js';

test('readPersistedSetupCompletionState detects persisted setup completion from chat state and onboarding history', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-persisted-setup-'));
  const chatStatePath = path.join(root, 'config', 'chat-state.local.json');
  await mkdir(path.dirname(chatStatePath), { recursive: true });
  await writeFile(chatStatePath, JSON.stringify({
    setupCompleteAt: '2026-03-31T04:14:48.267Z',
  }, null, 2));
  await writeFile(path.join(root, 'config', 'suite-onboarding-history.json'), JSON.stringify({
    schemaVersion: 1,
    updatedAt: '2026-03-31T04:14:48.267Z',
    activeAttemptId: 'desktop-bootstrap-20260331041158321-c53f309e',
    events: [{
      layer: 'product',
      kind: 'setup_completed',
      timestamp: '2026-03-31T04:14:48.267Z',
      attemptId: 'desktop-bootstrap-20260331041158321-c53f309e',
      summary: 'Packaged setup completed for chat.',
      status: 'ok',
      context: {},
      error: null,
      reference: null,
    }],
  }, null, 2));

  const state = await readPersistedSetupCompletionState(chatStatePath);
  assert.equal(state.setupCompleteAt, '2026-03-31T04:14:48.267Z');
  assert.equal(state.productSetupCompleted, true);
});

test('readPersistedSetupCompletionState tolerates missing persisted files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cats-persisted-setup-missing-'));
  const chatStatePath = path.join(root, 'config', 'chat-state.local.json');

  const state = await readPersistedSetupCompletionState(chatStatePath);
  assert.equal(state.setupCompleteAt, null);
  assert.equal(state.productSetupCompleted, false);
});
