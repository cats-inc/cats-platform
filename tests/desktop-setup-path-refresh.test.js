import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { createEmptyDesktopSetupState, settleSetupPathRefresh } from '../build/desktop/setupBridge.js';

const COMPLETED_AT = '2026-10-31T01:00:00.000Z';

function interruption(kind) {
  return { kind, summary: kind, resumable: true, requiresRestart: kind === 'restart_required', requiresElevation: false };
}

function stateAfter(helperId, status, kinds, { restartRequired = false, runState = 'completed' } = {}) {
  return {
    ...createEmptyDesktopSetupState(),
    lastAction: {
      helperId,
      assetId: `${helperId}-script`,
      label: helperId,
      pack: null,
      mode: 'apply',
      runState,
      status,
      summary: status,
      packagedRelativePath: 'desktop/setup-assets/windows/helper.ps1',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired,
      startedAt: '2026-10-31T00:58:00.000Z',
      completedAt: COMPLETED_AT,
      warnings: [],
      plannedActions: [],
      appliedChanges: [],
      optionalFollowThroughPack: null,
      manualSteps: [],
      interruptions: kinds.map(interruption),
      error: null,
    },
  };
}

function inventory(scannedAt, installed = []) {
  return { source: 'runtime', installed, total: installed.length, candidates: [], scannedAt };
}

const LATER = '2026-10-31T01:00:05.000Z';

// Measured on a clean Windows 11 VM for Cats Bot (its PLAN-010 Phase 3): every native
// installer asks for a relaunch and the npm folder for a restart, while cats-runtime's
// next scan, which re-reads the user PATH from the registry, already finds the CLI.
test('a scan after a native install settles its relaunch request and keeps the sign-in one', () => {
  const state = stateAfter('windows-claude-native-installer', 'relaunch_required', ['relaunch_required', 'auth_required']);
  const settled = settleSetupPathRefresh(state, inventory(LATER, ['windows-claude-native-installer']));
  assert.deepEqual(settled.lastAction.interruptions.map((entry) => entry.kind), ['auth_required']);
  assert.equal(settled.lastAction.status, 'auth_required');
  assert.equal(settled.lastAction.restartRequired, false);
});

test('a scan after the npm folder settles its restart request', () => {
  const state = stateAfter('windows-npm-prefix-helper', 'restart_required', ['restart_required'], { restartRequired: true });
  const settled = settleSetupPathRefresh(state, inventory(LATER));
  assert.deepEqual(settled.lastAction.interruptions, []);
  assert.equal(settled.lastAction.status, 'ready');
  assert.equal(settled.lastAction.restartRequired, false);
});

test('the request stands until a scan after the action finds what it needs', () => {
  const native = stateAfter('windows-grok-native-installer', 'relaunch_required', ['relaunch_required']);
  // No scan yet, a scan from before the action, or one that does not find the CLI.
  assert.equal(settleSetupPathRefresh(native, null), native);
  assert.equal(settleSetupPathRefresh(native, inventory(null, ['windows-grok-native-installer'])), native);
  assert.equal(settleSetupPathRefresh(native, inventory('2026-10-31T00:59:00.000Z', ['windows-grok-native-installer'])), native);
  assert.equal(settleSetupPathRefresh(native, inventory(LATER, [])), native);
  assert.equal(settleSetupPathRefresh(native, { ...inventory(LATER, ['windows-grok-native-installer']), source: 'unknown' }), native);
  // A failed action keeps its record.
  const failed = stateAfter('windows-grok-native-installer', 'relaunch_required', ['relaunch_required'], { runState: 'failed' });
  assert.equal(settleSetupPathRefresh(failed, inventory(LATER, ['windows-grok-native-installer'])), failed);
});

test('other helpers, other systems and other kinds keep their requests', () => {
  // The VC++ runtime can need a real reboot; a macOS helper's PATH is not re-read by the scan.
  for (const helperId of ['windows-vcredist-installer', 'macos-claude-native-installer', 'windows-ollama-local-model-installer']) {
    const state = stateAfter(helperId, 'restart_required', ['restart_required'], { restartRequired: true });
    assert.equal(settleSetupPathRefresh(state, inventory(LATER, [helperId])), state, helperId);
  }
  const elevation = stateAfter('windows-node-host-installer', 'elevation_required', ['elevation_required']);
  assert.equal(settleSetupPathRefresh(elevation, inventory(LATER)), elevation);
});

test('Desktop settles the last action whenever a finished scan lands', async () => {
  const main = await readFile(join(process.cwd(), 'desktop', 'host', 'main.ts'), 'utf8');
  assert.match(
    main,
    /clearCliInventoryError\(\);\s*\/\/[^\n]*\n\s*if \(setupState\) setupState = settleSetupPathRefresh\(setupState, buildDesktopCliInventoryFromRuntime\(probe\)\);\s*return true;/u,
  );
});
