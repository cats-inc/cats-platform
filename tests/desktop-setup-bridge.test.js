import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../dist-electron/config.js';
import { createDesktopPackagingPlan } from '../dist-electron/packaging.js';
import {
  buildDesktopSetupSnapshot,
  createEmptyDesktopSetupState,
  runDesktopSetupHelper,
} from '../dist-electron/setupBridge.js';

async function createDesktopConfig() {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-bridge-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');

  await mkdir(join(packageRoot, 'dist-server'), { recursive: true });
  await mkdir(join(runtimeRoot, 'dist'), { recursive: true });
  await writeFile(join(packageRoot, 'dist-server', 'index.js'), 'export {};');
  await writeFile(join(runtimeRoot, 'dist', 'index.js'), 'export {};');

  return resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'dist-server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'dist', 'index.js'),
      CATS_DESKTOP_RUNTIME_ROOT: runtimeRoot,
    },
    userDataDir: join(workingDir, 'user-data'),
  });
}

test('buildDesktopSetupSnapshot reports repo-owned helper availability', async () => {
  const config = await createDesktopConfig();
  await mkdir(join(config.packageRoot, 'scripts', 'windows'), { recursive: true });
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Setup-NodeGlobalPrefix.ps1'),
    '# helper',
  );

  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:00:00.000Z'),
  });
  const snapshot = await buildDesktopSetupSnapshot({
    config,
    packaging,
    state: createEmptyDesktopSetupState(),
  }, {
    platform: 'win32',
  });

  const prefixHelper = snapshot.helpers.find((helper) => helper.id === 'windows-npm-prefix-helper');
  assert.equal(prefixHelper?.available, true);
  assert.equal(prefixHelper?.supported, true);
  assert.equal(snapshot.state.lastAction, null);
  assert.equal(snapshot.resumeAction, null);
});

test('buildDesktopSetupSnapshot derives a resumable packaged setup next step', async () => {
  const config = await createDesktopConfig();
  await mkdir(join(config.packageRoot, 'scripts', 'windows'), { recursive: true });
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Install-WslUbuntuEnvironment.ps1'),
    '# helper',
  );

  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:02:00.000Z'),
  });
  const snapshot = await buildDesktopSetupSnapshot({
    config,
    packaging,
    state: {
      updatedAt: '2026-03-30T11:03:00.000Z',
      lastAction: {
        helperId: 'windows-wsl-environment-installer',
        assetId: 'windows-wsl-environment-installer-script',
        label: 'Windows WSL substrate and Ubuntu installer',
        mode: 'apply',
        runState: 'completed',
        status: 'restart_required',
        summary: 'Restart Windows before rerunning the WSL helper.',
        packagedRelativePath: 'desktop-host/setup-assets/windows/Install-WslUbuntuEnvironment.ps1',
        scriptPath: null,
        requiresElevation: true,
        resumable: true,
        restartRequired: true,
        startedAt: '2026-03-30T11:01:00.000Z',
        completedAt: '2026-03-30T11:02:00.000Z',
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
  }, {
    platform: 'win32',
  });

  assert.equal(snapshot.resumeAction?.helperId, 'windows-wsl-environment-installer');
  assert.equal(snapshot.resumeAction?.mode, 'check');
  assert.equal(snapshot.resumeAction?.reason, 'restart_required');
  assert.match(snapshot.resumeAction?.summary ?? '', /Restart Windows/i);
});

test('runDesktopSetupHelper normalizes successful helper execution', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:05:00.000Z'),
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'windows-install-readiness-audit',
      mode: 'check',
    },
  }, {
    platform: 'win32',
    pathExists: async () => true,
    now: (() => {
      const values = [
        new Date('2026-03-30T11:05:01.000Z'),
        new Date('2026-03-30T11:05:05.000Z'),
      ];
      return () => values.shift() ?? new Date('2026-03-30T11:05:05.000Z');
    })(),
    execFile: async (_file, args) => {
      assert.equal(args.includes('-CheckOnly'), true);
      assert.equal(args.includes('-Json'), true);
      return {
        stdout: JSON.stringify({
          helper: 'windows-setup-readiness-audit',
          status: 'auth_required',
          warnings: ['Claude Code still needs sign-in.'],
          plannedActions: ['provider:authenticate_claude_code'],
          appliedChanges: [],
          manualSteps: ['Complete the Claude Code sign-in flow, then rerun the packaged setup check.'],
          interruptions: [{
            kind: 'auth_required',
            summary: 'Complete the Claude Code sign-in flow or configure ANTHROPIC_API_KEY, then rerun the packaged setup check.',
            resumable: true,
            requiresRestart: false,
            requiresElevation: false,
          }],
        }),
        stderr: '',
      };
    },
  });

  assert.equal(record.helperId, 'windows-install-readiness-audit');
  assert.equal(record.mode, 'check');
  assert.equal(record.runState, 'completed');
  assert.equal(record.status, 'auth_required');
  assert.equal(record.restartRequired, false);
  assert.deepEqual(record.plannedActions, ['provider:authenticate_claude_code']);
  assert.deepEqual(record.manualSteps, ['Complete the Claude Code sign-in flow, then rerun the packaged setup check.']);
  assert.deepEqual(record.interruptions.map((entry) => entry.kind), ['auth_required']);
  assert.equal(record.error, null);
});

test('runDesktopSetupHelper fails when the requested mode is unsupported', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:10:00.000Z'),
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'windows-install-readiness-audit',
      mode: 'apply',
    },
  }, {
    platform: 'win32',
    pathExists: async () => true,
    now: (() => {
      const values = [
        new Date('2026-03-30T11:10:01.000Z'),
        new Date('2026-03-30T11:10:02.000Z'),
      ];
      return () => values.shift() ?? new Date('2026-03-30T11:10:02.000Z');
    })(),
  });

  assert.equal(record.runState, 'failed');
  assert.equal(record.status, 'failed');
  assert.match(record.error ?? '', /does not support apply mode/i);
});
