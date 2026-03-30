import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapSnapshot } from '../dist-electron/readiness.js';

const desktopConfig = {
  packageRoot: 'cats-platform',
  runtimePackageRoot: 'cats-runtime',
  userDataDir: 'C:/Users/test/AppData/Roaming/Cats',
  appHost: '127.0.0.1',
  appPort: 8181,
  appBaseUrl: 'http://127.0.0.1:8181',
  runtimeHost: '127.0.0.1',
  runtimePort: 3110,
  runtimeBaseUrl: 'http://127.0.0.1:3110',
  readinessTimeoutMs: 30000,
  readinessPollIntervalMs: 500,
  gracefulShutdownMs: 3000,
  background: {
    trayEnabled: true,
    keepServicesRunning: true,
    closeBehavior: 'minimize_to_tray',
  },
  update: {
    channel: 'stable',
    manifestUrl: 'https://updates.example.com/cats/stable.json',
    allowedHosts: [],
    checkOnStartup: false,
    autoDownload: false,
  },
  paths: {
    appEntryScript: 'cats-platform/dist-server/index.js',
    runtimeEntryScript: 'cats-runtime/dist/index.js',
    preloadScript: 'cats-platform/dist-electron/preload.cjs',
    appStatePath: 'cats-platform/config/chat-state.local.json',
    runtimeDataDir: 'cats-platform/.desktop/runtime/data',
    runtimeSessionBaseDir: 'cats-platform/.desktop/runtime/sessions',
    runtimeConfigPath: 'cats-platform/.desktop/runtime/providers.yaml',
    hostStatePath: 'cats-platform/.desktop/host/state.json',
    packagingOutputRoot: 'cats-platform/build/desktop-packaging',
  },
};

function readyService(name, healthUrl) {
  return {
    name,
    status: 'ready',
    ready: true,
    pid: name === 'cats' ? 222 : 111,
    startedAt: '2026-03-23T10:00:00.000Z',
    healthUrl,
    error: null,
    exitCode: null,
  };
}

test('desktop bootstrap stays in ready_for_setup until setup is completed', () => {
  const snapshot = buildDesktopBootstrapSnapshot({
    config: desktopConfig,
    services: [
      readyService('cats-runtime', 'http://127.0.0.1:3110/health'),
      readyService('cats', 'http://127.0.0.1:8181/health'),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: null,
    },
    runtimeHealth: {
      status: 'degraded',
      runtime: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      providers: {
        summary: {
          status: 'degraded',
          summary: 'No default provider targets are configured yet.',
          configuredProviders: 0,
          targets: 0,
          defaultTargets: 0,
          ok: 0,
          degraded: 0,
          unavailable: 0,
        },
      },
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
  });

  assert.equal(snapshot.phase, 'ready_for_setup');
  assert.equal(snapshot.app.entryPath, '/setup');
  assert.ok(snapshot.actions.some((action) => action.id === 'open_setup'));
  assert.equal(snapshot.progress.currentStepId, 'enter-chat');
  assert.equal(snapshot.background.trayEnabled, true);
  assert.equal(snapshot.updates.status, 'idle');
  assert.equal(snapshot.setup.lastAction, null);
  assert.equal(snapshot.hostStatePath, 'cats-platform/.desktop/host/state.json');
});

test('desktop bootstrap opens chat when setup and provider readiness are complete', () => {
  const snapshot = buildDesktopBootstrapSnapshot({
    config: desktopConfig,
    services: [
      readyService('cats-runtime', 'http://127.0.0.1:3110/health'),
      readyService('cats', 'http://127.0.0.1:8181/health'),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: '2026-03-23T10:05:00.000Z',
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
  });

  assert.equal(snapshot.phase, 'ready_for_chat');
  assert.equal(snapshot.status, 'ok');
  assert.equal(snapshot.app.entryPath, '/new');
  assert.ok(snapshot.actions.some((action) => action.id === 'open_chat'));
  assert.equal(snapshot.progress.steps.at(-1)?.status, 'completed');
  assert.equal(snapshot.packaging.targets.length >= 3, true);
});

test('desktop bootstrap surfaces packaged setup restart recovery as an install issue', () => {
  const snapshot = buildDesktopBootstrapSnapshot({
    config: desktopConfig,
    services: [
      readyService('cats-runtime', 'http://127.0.0.1:3110/health'),
      readyService('cats', 'http://127.0.0.1:8181/health'),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: null,
    },
    runtimeHealth: {
      status: 'degraded',
      runtime: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      providers: {
        summary: {
          status: 'degraded',
          summary: 'No default provider targets are configured yet.',
          configuredProviders: 0,
          targets: 0,
          defaultTargets: 0,
          ok: 0,
          degraded: 0,
          unavailable: 0,
        },
      },
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
      updatedAt: '2026-03-30T12:15:00.000Z',
      lastAction: {
        helperId: 'windows-wsl-environment-installer',
        assetId: 'windows-wsl-environment-installer-script',
        label: 'Windows WSL substrate and Ubuntu installer',
        mode: 'apply',
        runState: 'completed',
        status: 'restart_required',
        summary: 'Restart Windows, then rerun the WSL helper.',
        packagedRelativePath: 'desktop-host/setup-assets/windows/Install-WslUbuntuEnvironment.ps1',
        scriptPath: null,
        requiresElevation: true,
        resumable: true,
        restartRequired: true,
        startedAt: '2026-03-30T12:10:00.000Z',
        completedAt: '2026-03-30T12:15:00.000Z',
        warnings: [],
        plannedActions: ['install_distro:Ubuntu'],
        appliedChanges: ['enable_wsl_features'],
        manualSteps: ['Restart Windows, then rerun this helper to register the Ubuntu distro.'],
        interruptions: [{
          kind: 'restart_required',
          summary: 'Restart Windows, then rerun this helper to continue the WSL environment setup.',
          resumable: true,
          requiresRestart: true,
          requiresElevation: false,
        }],
        error: null,
      },
    },
  });

  const installIssue = snapshot.issues.find((issue) => issue.id === 'setup-restart-required');
  assert.ok(installIssue);
  assert.equal(installIssue?.category, 'install');
  assert.equal(installIssue?.remediation?.kind, 'resume_setup');
  assert.equal(installIssue?.remediation?.requiresRestart, true);
  assert.match(installIssue?.detail ?? '', /Restart Windows/i);
  assert.ok(snapshot.actions.some((action) => action.id === 'resume_setup'));
});

test('desktop bootstrap surfaces packaged setup auth recovery as an install issue', () => {
  const snapshot = buildDesktopBootstrapSnapshot({
    config: desktopConfig,
    services: [
      readyService('cats-runtime', 'http://127.0.0.1:3110/health'),
      readyService('cats', 'http://127.0.0.1:8181/health'),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: null,
    },
    runtimeHealth: {
      status: 'degraded',
      runtime: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      providers: {
        summary: {
          status: 'degraded',
          summary: 'No default provider targets are configured yet.',
          configuredProviders: 0,
          targets: 0,
          defaultTargets: 0,
          ok: 0,
          degraded: 0,
          unavailable: 0,
        },
      },
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
      updatedAt: '2026-03-30T12:20:00.000Z',
      lastAction: {
        helperId: 'windows-claude-native-installer',
        assetId: 'windows-claude-native-installer-script',
        label: 'Windows native Claude Code installer',
        mode: 'apply',
        runState: 'completed',
        status: 'auth_required',
        summary: 'Windows native Claude Code installer apply finished with auth_required.',
        packagedRelativePath: 'desktop-host/setup-assets/windows/Install-ClaudeCode.ps1',
        scriptPath: null,
        requiresElevation: false,
        resumable: true,
        restartRequired: false,
        startedAt: '2026-03-30T12:10:00.000Z',
        completedAt: '2026-03-30T12:20:00.000Z',
        warnings: [],
        plannedActions: ['provider:authenticate_claude_code'],
        appliedChanges: ['install_claude_code_native'],
        manualSteps: ['Complete the Claude Code sign-in flow, then rerun the packaged setup check.'],
        interruptions: [{
          kind: 'auth_required',
          summary: 'Complete the Claude Code sign-in flow or configure ANTHROPIC_API_KEY, then rerun the packaged setup check.',
          resumable: true,
          requiresRestart: false,
          requiresElevation: false,
        }],
        error: null,
      },
    },
  });

  const installIssue = snapshot.issues.find((issue) => issue.id === 'setup-auth-required');
  assert.ok(installIssue);
  assert.equal(installIssue?.category, 'install');
  assert.equal(installIssue?.remediation?.kind, 'resume_setup');
  assert.match(installIssue?.detail ?? '', /sign-in flow/i);
});

test('desktop bootstrap surfaces provider remediation after setup if no provider is ready', () => {
  const snapshot = buildDesktopBootstrapSnapshot({
    config: desktopConfig,
    services: [
      readyService('cats-runtime', 'http://127.0.0.1:3110/health'),
      readyService('cats', 'http://127.0.0.1:8181/health'),
    ],
    appHealth: {
      status: 'ok',
      summary: 'Cats app server is ready to accept requests.',
      readiness: { ready: true, phase: 'ready' },
      runtime: { reachable: true },
    },
    appShell: {
      setupCompleteAt: '2026-03-23T10:05:00.000Z',
    },
    runtimeHealth: {
      status: 'degraded',
      runtime: {
        status: 'ok',
        summary: 'Runtime is ready.',
      },
      providers: {
        summary: {
          status: 'degraded',
          summary: '1 provider target(s) need attention.',
          configuredProviders: 1,
          targets: 1,
          defaultTargets: 1,
          ok: 0,
          degraded: 1,
          unavailable: 0,
        },
      },
    },
    providerDiagnostics: {
      summary: {
        status: 'degraded',
        summary: '1 provider target(s) need attention.',
        configuredProviders: 1,
        targets: 1,
        defaultTargets: 1,
        ok: 0,
        degraded: 1,
        unavailable: 0,
      },
      providers: [
        {
          provider: 'claude',
          backend: 'cli',
          instance: 'default',
          target: 'cli/default',
          defaultTarget: true,
          availability: {
            status: 'degraded',
            summary: 'Claude CLI still needs authentication.',
            attentionCodes: ['auth_required'],
          },
        },
      ],
    },
  });

  assert.equal(snapshot.phase, 'needs_prerequisites');
  assert.ok(snapshot.issues.some((issue) => /provider target/i.test(issue.title)));
  assert.ok(snapshot.actions.some((action) => action.id === 'retry'));
  assert.ok(snapshot.actions.some((action) => action.id === 'open_setup'));
  assert.equal(snapshot.issues[0]?.remediation?.kind, 'open_setup');
  assert.equal(
    snapshot.progress.steps.find((step) => step.id === 'enter-chat')?.status,
    'failed',
  );
});
