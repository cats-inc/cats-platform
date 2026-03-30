import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../dist-electron/config.js';
import { createDesktopBackgroundState, DesktopHostStateStore } from '../dist-electron/hostState.js';
import { buildDesktopBootstrapSnapshot } from '../dist-electron/readiness.js';
import { createDesktopPackagingPlan } from '../dist-electron/packaging.js';
import { createEmptyDesktopSetupState } from '../dist-electron/setupBridge.js';
import { createDefaultDesktopUpdateState } from '../dist-electron/update.js';

function readyService(name, healthUrl) {
  return {
    name,
    status: 'ready',
    ready: true,
    pid: name === 'cats' ? 222 : 111,
    startedAt: '2026-03-24T10:00:00.000Z',
    healthUrl,
    error: null,
    exitCode: null,
  };
}

test('DesktopHostStateStore persists bootstrap snapshot with background and update state', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-host-state-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(workingDir, 'dist-server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(workingDir, 'cats-runtime', 'dist', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: join(workingDir, 'cats-runtime'),
    },
    userDataDir: join(workingDir, 'user-data'),
  });
  const background = createDesktopBackgroundState(config, {
    mode: 'background',
    windowVisible: false,
    lastHiddenAt: '2026-03-24T10:01:00.000Z',
  });
  const updates = createDefaultDesktopUpdateState(config.update);
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-24T10:02:00.000Z'),
  });
  const setup = createEmptyDesktopSetupState();
  setup.lastAction = {
    helperId: 'windows-install-readiness-audit',
    assetId: 'windows-setup-readiness-audit-script',
    label: 'Windows setup readiness audit',
    mode: 'check',
    runState: 'completed',
    status: 'changes_required',
    summary: 'Windows setup readiness audit check finished with changes_required.',
    packagedRelativePath: 'desktop-host/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    scriptPath: 'C:/repo/cats-platform/scripts/windows/Check-WindowsSetupReadiness.ps1',
    requiresElevation: false,
    resumable: true,
    restartRequired: true,
    startedAt: '2026-03-24T10:01:30.000Z',
    completedAt: '2026-03-24T10:01:45.000Z',
    warnings: [],
    plannedActions: ['repair_native_cli_pack'],
    appliedChanges: [],
    manualSteps: [],
    interruptions: [{
      kind: 'restart_required',
      summary: 'Restart Windows, then rerun this helper to continue the WSL environment setup.',
      resumable: true,
      requiresRestart: true,
      requiresElevation: false,
    }],
    error: null,
  };
  setup.updatedAt = '2026-03-24T10:01:45.000Z';
  const snapshot = buildDesktopBootstrapSnapshot({
    config,
    services: [
      readyService('cats-runtime', `${config.runtimeBaseUrl}/health`),
      readyService('cats', `${config.appBaseUrl}/health`),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: '2026-03-24T10:00:00.000Z',
    },
    runtimeHealth: {
      status: 'ok',
      runtime: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      providers: {
        summary: {
          status: 'ok',
          summary: 'All configured provider targets passed the current probe mode.',
          configuredProviders: 1,
          targets: 1,
          defaultTargets: 1,
          ok: 1,
          degraded: 0,
          unavailable: 0,
        },
      },
    },
    providerDiagnostics: {
      summary: {
        status: 'ok',
        summary: 'All configured provider targets passed the current probe mode.',
        configuredProviders: 1,
        targets: 1,
        defaultTargets: 1,
        ok: 1,
        degraded: 0,
        unavailable: 0,
      },
      providers: [],
    },
    background,
    updates,
    packaging,
    setup,
    hostStatePath: config.paths.hostStatePath,
    now: () => new Date('2026-03-24T10:03:00.000Z'),
  });
  const store = new DesktopHostStateStore(config.paths.hostStatePath, {
    now: () => new Date('2026-03-24T10:04:00.000Z'),
  });

  await store.save({
    snapshot,
    background,
    updates,
    packaging,
    setup,
  });

  const persisted = JSON.parse(await readFile(config.paths.hostStatePath, 'utf8'));
  assert.equal(persisted.savedAt, '2026-03-24T10:04:00.000Z');
  assert.equal(persisted.snapshot.background.mode, 'background');
  assert.equal(persisted.snapshot.hostStatePath, config.paths.hostStatePath);
  assert.equal(persisted.setup.lastAction.helperId, 'windows-install-readiness-audit');
  assert.equal(persisted.snapshot.setup.lastAction.status, 'changes_required');
});
