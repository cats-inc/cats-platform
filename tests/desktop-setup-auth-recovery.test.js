import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { createDesktopPackagingPlan } from '../build/desktop/packaging.js';
import {
  buildDesktopSetupSnapshot,
  reconcileSetupAuthRecovery,
  runDesktopSetupHelper,
} from '../build/desktop/setupBridge.js';

const HELPER = 'windows-claude-native-installer';
const COMPLETED = '2026-11-02T01:00:00.000Z';
const LATER = '2026-11-02T01:00:05.000Z';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'cats-desktop-auth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = join(root, 'cats', 'build', 'server');
  const runtime = join(root, 'runtime', 'build', 'runtime');
  await mkdir(app, { recursive: true });
  await mkdir(runtime, { recursive: true });
  await writeFile(join(app, 'index.js'), 'export {};');
  await writeFile(join(runtime, 'index.js'), 'export {};');
  const config = resolveDesktopHostConfig({
    env: { CATS_DESKTOP_APP_ENTRY: join(app, 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtime, 'index.js'), CATS_DESKTOP_RUNTIME_ROOT: join(root, 'runtime') },
    userDataDir: join(root, 'user-data'),
  });
  const packaging = createDesktopPackagingPlan(config, { generatedAt: new Date(COMPLETED) });
  const dependencies = { platform: 'win32', pathExists: async () => true, now: () => new Date(COMPLETED),
    execFile: async (_file, args) => {
      assert.ok(args.includes('-CheckOnly'));
      return { stdout: JSON.stringify({ status: 'auth_required', installed: true,
        manualSteps: ['Run claude to sign in.'], interruptions: [{ kind: 'auth_required', summary: 'Sign in to Claude.' }] }), stderr: '' };
    } };
  const record = await runDesktopSetupHelper({ config, packaging, action: { helperId: HELPER, mode: 'check' } }, dependencies);
  const state = { lastAction: record, updatedAt: COMPLETED };
  const snapshot = await buildDesktopSetupSnapshot({ config, packaging, state }, dependencies);
  assert.equal(snapshot.resumeAction.reason, 'auth_required');
  return snapshot;
}

function inventory(authStatus, candidate = {}) {
  return { source: 'runtime', installed: [HELPER], total: 1, scannedAt: LATER,
    candidates: [{ helperId: HELPER, providerId: 'claude_code', label: 'Claude',
      installed: true, available: true, supported: true, authStatus, observedAt: LATER, ...candidate }] };
}

test('a newer unknown CLI observation offers verification without repeating old sign-in advice', async t => {
  const snapshot = await fixture(t);
  const original = structuredClone(snapshot);
  const next = reconcileSetupAuthRecovery(snapshot, inventory('unknown'));
  assert.equal(next.resumeAction.reason, 'verification_recommended');
  assert.equal(next.resumeAction.mode, 'check');
  assert.deepEqual(next.resumeAction.manualSteps, []);
  assert.deepEqual(next.resumeAction.interruptions, []);
  assert.doesNotMatch(next.resumeAction.summary, /sign in|authenticated|ready/iu);
  assert.strictEqual(next.state, snapshot.state);
  assert.deepEqual(snapshot, original, 'the helper result remains history, including its original auth requirement');
});

test('a newer matching CLI observation needing no authentication clears the auth-only recommendation', async t => {
  const snapshot = await fixture(t);
  const next = reconcileSetupAuthRecovery(snapshot, inventory('not_required'));
  assert.equal(next.resumeAction, null);
  assert.strictEqual(next.state.lastAction, snapshot.state.lastAction);
});

test('an explicit missing-auth observation keeps the sign-in action', async t => {
  const snapshot = await fixture(t);
  assert.strictEqual(reconcileSetupAuthRecovery(snapshot, inventory('missing')), snapshot);
});

test('old, absent, invalid and unrelated evidence cannot replace a helper auth result', async t => {
  const snapshot = await fixture(t);
  for (const evidence of [
    null,
    { ...inventory('not_required'), source: 'unknown' },
    inventory('not_required', { observedAt: null }),
    inventory('not_required', { observedAt: 'invalid' }),
    inventory('not_required', { observedAt: COMPLETED }),
    inventory('not_required', { observedAt: '2026-11-02T00:59:59.000Z' }),
    inventory('not_required', { installed: false }),
    inventory('not_required', { helperId: 'windows-codex-native-installer' }),
  ]) assert.strictEqual(reconcileSetupAuthRecovery(snapshot, evidence), snapshot);
});

test('failed or incomplete action history and non-auth recovery keep their original recommendations', async t => {
  const snapshot = await fixture(t);
  for (const update of [{ runState: 'failed' }, { runState: 'running' }, { completedAt: null }, { completedAt: 'invalid' }]) {
    const current = { ...snapshot, state: { ...snapshot.state, lastAction: { ...snapshot.state.lastAction, ...update } } };
    assert.strictEqual(reconcileSetupAuthRecovery(current, inventory('not_required')), current);
  }
  for (const reason of ['restart_required', 'relaunch_required', 'elevation_required', 'retry_failed']) {
    const current = { ...snapshot, resumeAction: { ...snapshot.resumeAction, reason } };
    assert.strictEqual(reconcileSetupAuthRecovery(current, inventory('not_required')), current);
  }
  for (const update of [{ restartRequired: true }, { requiresElevation: true },
    { interruptions: [{ kind: 'restart_required' }, { kind: 'auth_required' }] }]) {
    const current = { ...snapshot, resumeAction: { ...snapshot.resumeAction, ...update } };
    assert.strictEqual(reconcileSetupAuthRecovery(current, inventory('not_required')), current);
  }
  const unsupported = { ...snapshot, helpers: snapshot.helpers.map(helper => ({ ...helper, supportsCheckOnly: false })) };
  assert.strictEqual(reconcileSetupAuthRecovery(unsupported, inventory('unknown')), unsupported);
});
