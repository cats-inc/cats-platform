import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDesktopHostPlatformShellUpdate,
  normalizePlatformShellSetupState,
  parseDesktopHostPlatformShellUpdate,
} from '../build/desktop/platformShellUpdate.js';
import { createEmptyDesktopSetupState } from '../build/desktop/setupBridge.js';

test('desktop host platform shell update promotes setup completion and clears startup provider reprobe state', () => {
  const nextState = applyDesktopHostPlatformShellUpdate({
    appShell: {
      bootstrapAttemptId: null,
      setupCompleteAt: null,
      products: [],
    },
    persistedSetup: {
      setupCompleteAt: null,
      productSetupCompleted: false,
    },
    providerDiagnostics: {
      summary: {
        status: 'degraded',
        summary: 'No provider targets are configured yet.',
        configuredProviders: 0,
        targets: 0,
        defaultTargets: 0,
        ok: 0,
        degraded: 0,
        unavailable: 0,
      },
      providers: [],
    },
    setup: {
      updatedAt: '2026-04-06T07:59:00.000Z',
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
        startedAt: '2026-04-06T07:58:00.000Z',
        completedAt: '2026-04-06T07:59:00.000Z',
        warnings: [],
        plannedActions: [],
        appliedChanges: [],
        optionalFollowThroughPack: null,
        manualSteps: [],
        interruptions: [],
        error: null,
      },
    },
  }, {
    bootstrapAttemptId: 'attempt-123',
    setupCompleteAt: '2026-04-06T08:00:00.000Z',
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.equal(nextState.appShell?.bootstrapAttemptId, 'attempt-123');
  assert.equal(nextState.appShell?.setupCompleteAt, '2026-04-06T08:00:00.000Z');
  assert.equal(nextState.persistedSetup.productSetupCompleted, true);
  assert.equal(nextState.providerDiagnostics, null);
  assert.deepEqual(nextState.setup, createEmptyDesktopSetupState());
  assert.deepEqual(nextState.appShell?.products?.map((product) => product.id), ['chat']);
});

test('desktop host platform shell update clears persisted setup completion when reset returns setupCompleteAt=null', () => {
  const nextState = applyDesktopHostPlatformShellUpdate({
    appShell: {
      bootstrapAttemptId: 'attempt-123',
      setupCompleteAt: '2026-04-06T08:00:00.000Z',
      products: [],
    },
    persistedSetup: {
      setupCompleteAt: '2026-04-06T08:00:00.000Z',
      productSetupCompleted: true,
    },
    providerDiagnostics: null,
    setup: createEmptyDesktopSetupState(),
  }, {
    bootstrapAttemptId: 'attempt-456',
    setupCompleteAt: null,
    products: [
      {
        id: 'chat',
        productName: 'Cats Chat',
        routePrefix: '/chat',
        installState: 'installed',
        setup: { selectable: true },
      },
    ],
  });

  assert.equal(nextState.appShell?.bootstrapAttemptId, 'attempt-456');
  assert.equal(nextState.appShell?.setupCompleteAt, null);
  assert.equal(nextState.persistedSetup.setupCompleteAt, null);
  assert.equal(nextState.persistedSetup.productSetupCompleted, false);
});

test('normalizePlatformShellSetupState clears stale readiness-audit state after setup is complete', () => {
  const normalized = normalizePlatformShellSetupState({
    updatedAt: '2026-04-06T07:59:00.000Z',
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
      startedAt: '2026-04-06T07:58:00.000Z',
      completedAt: '2026-04-06T07:59:00.000Z',
      warnings: [],
      plannedActions: [],
      appliedChanges: [],
      optionalFollowThroughPack: null,
      manualSteps: [],
      interruptions: [],
      error: null,
    },
  }, true);

  assert.deepEqual(normalized, createEmptyDesktopSetupState());
});

test('normalizePlatformShellSetupState preserves non-audit packaged setup follow-through after setup is complete', () => {
  const setupState = {
    updatedAt: '2026-04-06T07:59:00.000Z',
    lastAction: {
      helperId: 'windows-wsl-environment-installer',
      assetId: 'windows-wsl-environment-installer-script',
      label: 'Windows WSL environment installer',
      mode: 'check',
      runState: 'completed',
      status: 'restart_required',
      summary: 'Restart Windows, then rerun this helper to continue the WSL environment setup.',
      packagedRelativePath: 'desktop/setup-assets/windows/Install-WslUbuntuEnvironment.ps1',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired: true,
      startedAt: '2026-04-06T07:58:00.000Z',
      completedAt: '2026-04-06T07:59:00.000Z',
      warnings: [],
      plannedActions: [],
      appliedChanges: [],
      optionalFollowThroughPack: null,
      manualSteps: ['Restart Windows.'],
      interruptions: [{
        kind: 'restart_required',
        summary: 'Restart Windows, then rerun this helper to continue the WSL environment setup.',
        resumable: true,
        requiresRestart: true,
        requiresElevation: false,
      }],
      error: null,
    },
  };

  assert.deepEqual(normalizePlatformShellSetupState(setupState, true), setupState);
});

test('desktop host platform shell update parser normalizes invalid payloads', () => {
  assert.throws(() => parseDesktopHostPlatformShellUpdate(null), /invalid desktop platform shell payload/i);

  const parsed = parseDesktopHostPlatformShellUpdate({
    bootstrapAttemptId: ' attempt-456 ',
    setupCompleteAt: ' 2026-04-06T09:00:00.000Z ',
    products: [
      {
        id: 'work',
        productName: 'Cats Work',
        routePrefix: '/work',
        installState: 'installed',
        setup: {
          selectable: true,
          disabledReason: ' ',
        },
      },
      'ignored',
    ],
  });

  assert.equal(parsed.bootstrapAttemptId, 'attempt-456');
  assert.equal(parsed.setupCompleteAt, '2026-04-06T09:00:00.000Z');
  assert.deepEqual(parsed.products, [
    {
      id: 'work',
      productName: 'Cats Work',
      routePrefix: '/work',
      installState: 'installed',
      setup: {
        selectable: true,
        disabledReason: undefined,
      },
    },
  ]);
});
