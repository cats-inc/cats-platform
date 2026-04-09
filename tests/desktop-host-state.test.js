import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import {
  appendHostEvent,
  buildDesktopAggregationBundle,
  createDesktopBootstrapEvent,
  createEmptyDesktopDiagnosticsState,
} from '../build/desktop/bootstrapDiagnostics.js';
import { createDesktopBackgroundState, DesktopHostStateStore } from '../build/desktop/hostState.js';
import { buildDesktopBootstrapSnapshot } from '../build/desktop/readiness.js';
import { createDesktopPackagingPlan } from '../build/desktop/packaging.js';
import { createEmptyDesktopSetupState } from '../build/desktop/setupBridge.js';
import { createDefaultDesktopUpdateState } from '../build/desktop/update.js';

function readyService(name, healthUrl) {
  return {
    name,
    status: 'ready',
    ready: true,
    pid: name === 'cats-platform' ? 222 : 111,
    startedAt: '2026-03-24T10:00:00.000Z',
    healthUrl,
    error: null,
    exitCode: null,
    logPath: `C:/Users/test/.cats/desktop/logs/${name}.log`,
    lastOutput: `${name} ready`,
    lastOutputAt: '2026-03-24T10:00:00.000Z',
  };
}

test('DesktopHostStateStore persists bootstrap snapshot with background and update state', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-host-state-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(workingDir, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(workingDir, 'cats-runtime', 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: join(workingDir, 'cats-runtime'),
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
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
    pack: 'native_cli_pack',
    mode: 'check',
    runState: 'completed',
    status: 'changes_required',
    summary: 'Windows setup readiness audit check finished with changes_required.',
    packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
    scriptPath: 'C:/repo/cats-platform/scripts/windows/Check-WindowsSetupReadiness.ps1',
    requiresElevation: false,
    resumable: true,
    restartRequired: true,
    startedAt: '2026-03-24T10:01:30.000Z',
    completedAt: '2026-03-24T10:01:45.000Z',
    warnings: [],
    plannedActions: ['repair_native_cli_pack'],
    appliedChanges: [],
    optionalFollowThroughPack: null,
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
      readyService('cats-platform', `${config.appBaseUrl}/health`),
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
  let diagnostics = createEmptyDesktopDiagnosticsState(['cats-runtime', 'cats-platform']);
  diagnostics = appendHostEvent(diagnostics, createDesktopBootstrapEvent({
    layer: 'host',
    kind: 'host_phase_changed',
    timestamp: '2026-03-24T10:03:00.000Z',
    attemptId: 'attempt-001',
    summary: 'Desktop host phase is ready_for_chat.',
    status: 'ok',
    context: {
      phase: 'ready_for_chat',
    },
    reference: {
      artifactPath: config.paths.hostStatePath,
    },
  }));
  diagnostics = {
    ...diagnostics,
    activeAttemptId: 'attempt-001',
    serviceLogs: [
      {
        service: 'cats-runtime',
        logPath: `${config.paths.hostLogsDir}\\cats-runtime.log`,
        lastOutput: 'runtime ready',
        lastOutputAt: '2026-03-24T10:03:00.000Z',
      },
      {
        service: 'cats-platform',
        logPath: `${config.paths.hostLogsDir}\\cats-platform.log`,
        lastOutput: 'app ready',
        lastOutputAt: '2026-03-24T10:03:00.000Z',
      },
    ],
  };
  diagnostics = {
    ...diagnostics,
    aggregation: buildDesktopAggregationBundle({
      generatedAt: '2026-03-24T10:03:00.000Z',
      attemptId: diagnostics.activeAttemptId,
      runtimeEvents: [],
      product: null,
      hostEvents: diagnostics.hostEvents,
      runtimeFallback: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      hostFallback: {
        status: 'ok',
        summary: 'Desktop services and at least one provider path are ready.',
      },
    }),
    updatedAt: '2026-03-24T10:03:00.000Z',
  };
  const persistedSnapshot = {
    ...snapshot,
    diagnostics,
  };

  await store.save({
    snapshot: persistedSnapshot,
    background,
    updates,
    packaging,
    setup,
    diagnostics,
  });

  const persisted = JSON.parse(await readFile(config.paths.hostStatePath, 'utf8'));
  assert.equal(persisted.savedAt, '2026-03-24T10:04:00.000Z');
  assert.equal(persisted.snapshot.background.mode, 'background');
  assert.equal(persisted.snapshot.hostStatePath, config.paths.hostStatePath);
  assert.equal(persisted.setup.lastAction.helperId, 'windows-install-readiness-audit');
  assert.equal(persisted.setup.lastAction.pack, 'native_cli_pack');
  assert.equal(persisted.setup.lastAction.optionalFollowThroughPack, null);
  assert.equal(persisted.snapshot.setup.lastAction.status, 'changes_required');
  assert.equal(persisted.diagnostics.activeAttemptId, 'attempt-001');
  assert.equal(persisted.snapshot.diagnostics.aggregation.layers.host.summary, 'Desktop host phase is ready_for_chat.');
});

test('DesktopHostStateStore normalizes legacy quit-on-close background flags back to tray defaults', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-host-state-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(workingDir, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(workingDir, 'cats-runtime', 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: join(workingDir, 'cats-runtime'),
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
  });
  const store = new DesktopHostStateStore(config.paths.hostStatePath);

  await mkdir(join(workingDir, '.cats', 'desktop'), { recursive: true });
  await writeFile(config.paths.hostStatePath, JSON.stringify({
    version: 1,
    updatedAt: '2026-04-10T00:00:00.000Z',
    snapshot: {
      background: {
        trayEnabled: false,
        keepServicesRunning: false,
        mode: 'background',
        closeBehavior: 'quit',
        windowVisible: false,
        lastHiddenAt: '2026-04-10T00:00:00.000Z',
      },
    },
    background: {
      trayEnabled: false,
      keepServicesRunning: false,
      mode: 'background',
      closeBehavior: 'quit',
      windowVisible: false,
      lastHiddenAt: '2026-04-10T00:00:00.000Z',
    },
  }, null, 2) + '\n', 'utf8');

  const loaded = await store.load(config, {
    background: createDesktopBackgroundState(config),
    updates: createDefaultDesktopUpdateState(config.update),
    packaging: createDesktopPackagingPlan(config),
    setup: createEmptyDesktopSetupState(),
  });

  assert.equal(loaded?.background.trayEnabled, true);
  assert.equal(loaded?.background.keepServicesRunning, true);
  assert.equal(loaded?.background.closeBehavior, 'minimize_to_tray');
  assert.equal(loaded?.background.mode, 'background');
  assert.equal(loaded?.background.windowVisible, false);
});

test('DesktopHostStateStore loads legacy setup state without optional follow-through fields', async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-host-state-legacy-'));
  const config = resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(workingDir, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(workingDir, 'cats-runtime', 'build', 'runtime', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: join(workingDir, 'cats-runtime'),
    },
    userDataDir: join(workingDir, 'user-data'),
    catsHomeDir: join(workingDir, '.cats'),
  });
  const background = createDesktopBackgroundState(config);
  const updates = createDefaultDesktopUpdateState(config.update);
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T18:00:00.000Z'),
  });
  const setup = createEmptyDesktopSetupState();
  const store = new DesktopHostStateStore(config.paths.hostStatePath, {
    now: () => new Date('2026-03-30T18:05:00.000Z'),
  });

  await mkdir(join(config.paths.hostStatePath, '..'), { recursive: true });
  await writeFile(config.paths.hostStatePath, JSON.stringify({
    snapshot: {
      background,
      updates,
      packaging,
      setup: {
        updatedAt: '2026-03-30T18:02:00.000Z',
        lastAction: {
          helperId: 'windows-install-readiness-audit',
          assetId: 'windows-setup-readiness-audit-script',
          label: 'Windows setup readiness audit',
          mode: 'check',
          runState: 'completed',
          status: 'not_installed',
          summary: 'Windows setup readiness audit check finished with not_installed.',
          packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
          scriptPath: null,
          requiresElevation: false,
          resumable: true,
          restartRequired: false,
          startedAt: '2026-03-30T18:01:00.000Z',
          completedAt: '2026-03-30T18:02:00.000Z',
          warnings: [],
          plannedActions: ['local_model:install_ollama_local_model'],
          appliedChanges: [],
          manualSteps: [],
          interruptions: [],
          error: null,
        },
      },
      hostStatePath: config.paths.hostStatePath,
    },
    background,
    updates,
    packaging,
    setup: {
      updatedAt: '2026-03-30T18:02:00.000Z',
      lastAction: {
        helperId: 'windows-install-readiness-audit',
        assetId: 'windows-setup-readiness-audit-script',
        label: 'Windows setup readiness audit',
        mode: 'check',
        runState: 'completed',
        status: 'not_installed',
        summary: 'Windows setup readiness audit check finished with not_installed.',
        packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
        scriptPath: null,
        requiresElevation: false,
        resumable: true,
        restartRequired: false,
        startedAt: '2026-03-30T18:01:00.000Z',
        completedAt: '2026-03-30T18:02:00.000Z',
        warnings: [],
        plannedActions: ['local_model:install_ollama_local_model'],
        appliedChanges: [],
        manualSteps: [],
        interruptions: [],
        error: null,
      },
    },
    savedAt: '2026-03-30T18:03:00.000Z',
  }, null, 2));

  const loaded = await store.load(config, {
    background,
    updates,
    packaging,
    setup,
  });

  assert.ok(loaded);
  assert.equal(loaded?.setup.lastAction?.pack, null);
  assert.equal(loaded?.setup.lastAction?.optionalFollowThroughPack, null);
  assert.deepEqual(loaded?.setup.lastAction?.plannedActions, ['local_model:install_ollama_local_model']);
  assert.equal(loaded?.diagnostics.activeAttemptId, null);
});
