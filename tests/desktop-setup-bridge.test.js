import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { resolveDesktopHostConfig } from '../build/desktop/config.js';
import { createDesktopPackagingPlan } from '../build/desktop/packaging.js';
import {
  buildDesktopSetupSnapshot,
  createEmptyDesktopSetupState,
  describeSetupPack,
  isOptionalCapabilityPackSetupAction,
  runDesktopSetupHelper,
  shouldAutoRunSetupAudit,
} from '../build/desktop/setupBridge.js';

async function createDesktopConfig() {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-bridge-'));
  const packageRoot = join(workingDir, 'cats');
  const runtimeRoot = join(workingDir, 'cats-runtime');

  await mkdir(join(packageRoot, 'build', 'server'), { recursive: true });
  await mkdir(join(runtimeRoot, 'build', 'runtime'), { recursive: true });
  await writeFile(join(packageRoot, 'build', 'server', 'index.js'), 'export {};');
  await writeFile(join(runtimeRoot, 'build', 'runtime', 'index.js'), 'export {};');

  return resolveDesktopHostConfig({
    env: {
      CATS_DESKTOP_APP_ENTRY: join(packageRoot, 'build', 'server', 'index.js'),
      CATS_DESKTOP_RUNTIME_ENTRY: join(runtimeRoot, 'build', 'runtime', 'index.js'),
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

test('buildDesktopSetupSnapshot reports packaged Unix helper availability on Linux hosts', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-04-04T09:00:00.000Z'),
    platforms: ['linux'],
  });

  const snapshot = await buildDesktopSetupSnapshot({
    config,
    packaging,
    state: createEmptyDesktopSetupState(),
  }, {
    platform: 'linux',
    pathExists: async () => true,
  });

  const prefixHelper = snapshot.helpers.find((helper) => helper.id === 'linux-npm-prefix-helper');
  const readinessHelper = snapshot.helpers.find((helper) => helper.id === 'linux-install-readiness-audit');
  assert.equal(prefixHelper?.available, true);
  assert.equal(prefixHelper?.supported, true);
  assert.equal(readinessHelper?.available, true);
  assert.equal(readinessHelper?.supported, true);
});

test('shouldAutoRunSetupAudit only primes the readiness audit before packaged setup is completed', () => {
  assert.equal(shouldAutoRunSetupAudit(null), true);
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastAction: {
      helperId: 'windows-install-readiness-audit',
      assetId: 'windows-setup-readiness-audit-script',
      label: 'Windows setup readiness audit',
      mode: 'check',
      runState: 'completed',
      status: 'changes_required',
      summary: 'Windows setup readiness audit check finished with changes_required.',
      packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired: false,
      startedAt: '2026-03-30T10:59:00.000Z',
      completedAt: '2026-03-30T11:00:00.000Z',
      warnings: [],
      plannedActions: ['repair_native_cli_pack'],
      appliedChanges: [],
      manualSteps: [],
      interruptions: [],
      error: null,
    },
  }), false);
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-04-04T09:01:00.000Z',
    lastAction: {
      helperId: 'linux-install-readiness-audit',
      assetId: 'linux-setup-readiness-audit-script',
      label: 'Linux setup readiness audit',
      mode: 'check',
      runState: 'completed',
      status: 'changes_required',
      summary: 'Linux setup readiness audit check finished with changes_required.',
      packagedRelativePath: 'desktop/setup-assets/linux/check-installation.sh',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired: false,
      startedAt: '2026-04-04T09:00:00.000Z',
      completedAt: '2026-04-04T09:01:00.000Z',
      warnings: [],
      plannedActions: ['repair_native_cli_pack'],
      appliedChanges: [],
      manualSteps: [],
      interruptions: [],
      error: null,
    },
  }), false);
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastAction: {
      helperId: 'windows-ollama-local-model-installer',
      assetId: 'windows-ollama-local-model-installer-script',
      label: 'Windows Ollama local-model installer',
      mode: 'apply',
      runState: 'completed',
      status: 'ready',
      summary: 'Windows Ollama local-model installer apply finished with ready.',
      packagedRelativePath: 'desktop/setup-assets/windows/Install-Ollama.ps1',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired: false,
      startedAt: '2026-03-30T10:59:00.000Z',
      completedAt: '2026-03-30T11:00:00.000Z',
      warnings: [],
      plannedActions: [],
      appliedChanges: ['install_ollama_local_model'],
      manualSteps: [],
      interruptions: [],
      error: null,
    },
  }), true);
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastAction: null,
  }, {
    setupCompleteAt: '2026-03-30T11:05:00.000Z',
  }), false);
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastAction: null,
  }, {
    productSetupCompleted: true,
  }), false);
});

test('shouldAutoRunSetupAudit preserves active non-audit recovery states', () => {
  assert.equal(shouldAutoRunSetupAudit({
    updatedAt: '2026-03-30T11:00:00.000Z',
    lastAction: {
      helperId: 'windows-ollama-local-model-installer',
      assetId: 'windows-ollama-local-model-installer-script',
      label: 'Windows Ollama local-model installer',
      mode: 'apply',
      runState: 'completed',
      status: 'changes_required',
      summary: 'Start Ollama and rerun the packaged setup check.',
      packagedRelativePath: 'desktop/setup-assets/windows/Install-Ollama.ps1',
      scriptPath: null,
      requiresElevation: false,
      resumable: true,
      restartRequired: false,
      startedAt: '2026-03-30T10:59:00.000Z',
      completedAt: '2026-03-30T11:00:00.000Z',
      warnings: [],
      plannedActions: ['local_model:start_ollama_local_model'],
      appliedChanges: ['install_ollama_local_model'],
      manualSteps: ['Launch Ollama from the Start menu, then wait for http://127.0.0.1:11434 to respond.'],
      interruptions: [],
      error: null,
    },
  }), false);
});

test('isOptionalCapabilityPackSetupAction detects optional local-model audit follow-through', () => {
  assert.equal(isOptionalCapabilityPackSetupAction({
    helperId: 'windows-install-readiness-audit',
    plannedActions: ['local_model:install_ollama_local_model'],
  }), true);
  assert.equal(isOptionalCapabilityPackSetupAction({
    helperId: 'windows-install-readiness-audit',
    plannedActions: ['docker:start_docker_desktop'],
  }), false);
  assert.equal(isOptionalCapabilityPackSetupAction({
    helperId: 'windows-install-readiness-audit',
    plannedActions: ['repair_native_cli_pack'],
  }), false);
  assert.equal(isOptionalCapabilityPackSetupAction({
    helperId: 'windows-ollama-local-model-installer',
    plannedActions: ['local_model:install_ollama_local_model'],
  }), false);
});

test('describeSetupPack formats packaged setup pack labels', () => {
  assert.equal(describeSetupPack('local_model_pack'), 'local model pack');
  assert.equal(describeSetupPack('native_cli_pack'), 'native CLI pack');
  assert.equal(describeSetupPack(null), null);
});

test('buildDesktopSetupSnapshot derives a resumable packaged setup next step', async () => {
  const config = await createDesktopConfig();
  await mkdir(join(config.packageRoot, 'scripts', 'windows'), { recursive: true });
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Install-KiroCli.ps1'),
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
        helperId: 'windows-kiro-native-installer',
        assetId: 'windows-kiro-native-installer-script',
        label: 'Windows native Kiro installer',
        mode: 'apply',
        runState: 'completed',
        status: 'restart_required',
        summary: 'Restart Windows before rerunning the Kiro CLI helper.',
        packagedRelativePath: 'desktop/setup-assets/windows/Install-KiroCli.ps1',
        scriptPath: null,
        requiresElevation: true,
        resumable: true,
        restartRequired: true,
        startedAt: '2026-03-30T11:01:00.000Z',
        completedAt: '2026-03-30T11:02:00.000Z',
        warnings: [],
        plannedActions: ['install_kiro_cli'],
        appliedChanges: [],
        manualSteps: ['Restart Windows, then rerun this helper to finish Kiro CLI install.'],
        interruptions: [{
          kind: 'restart_required',
          summary: 'Restart Windows, then rerun this helper to finish Kiro CLI install.',
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

  assert.equal(snapshot.resumeAction?.helperId, 'windows-kiro-native-installer');
  assert.equal(snapshot.resumeAction?.mode, 'check');
  assert.equal(snapshot.resumeAction?.reason, 'restart_required');
  assert.match(snapshot.resumeAction?.summary ?? '', /Restart Windows/i);
});

test('buildDesktopSetupSnapshot prefers verification after manual Ollama follow-through', async () => {
  const config = await createDesktopConfig();
  await mkdir(join(config.packageRoot, 'scripts', 'windows'), { recursive: true });
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Install-Ollama.ps1'),
    '# helper',
  );

  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:04:00.000Z'),
  });
  const snapshot = await buildDesktopSetupSnapshot({
    config,
    packaging,
    state: {
      updatedAt: '2026-03-30T11:05:00.000Z',
      lastAction: {
        helperId: 'windows-ollama-local-model-installer',
        assetId: 'windows-ollama-local-model-installer-script',
        label: 'Windows Ollama local-model installer',
        mode: 'apply',
        runState: 'completed',
        status: 'changes_required',
        summary: 'Start Ollama and rerun the packaged setup check.',
        packagedRelativePath: 'desktop/setup-assets/windows/Install-Ollama.ps1',
        scriptPath: null,
        requiresElevation: false,
        resumable: true,
        restartRequired: false,
        startedAt: '2026-03-30T11:04:30.000Z',
        completedAt: '2026-03-30T11:05:00.000Z',
        warnings: [],
        plannedActions: ['local_model:start_ollama_local_model'],
        appliedChanges: ['install_ollama_local_model'],
        manualSteps: ['Launch Ollama from the Start menu, then wait for http://127.0.0.1:11434 to respond.'],
        interruptions: [],
        error: null,
      },
    },
  }, {
    platform: 'win32',
  });

  assert.equal(snapshot.resumeAction?.helperId, 'windows-ollama-local-model-installer');
  assert.equal(snapshot.resumeAction?.mode, 'check');
  assert.equal(snapshot.resumeAction?.reason, 'manual_follow_up');
  assert.match(snapshot.resumeAction?.summary ?? '', /verification step/i);
});

test('buildDesktopSetupSnapshot routes install_node_lts to the Node host installer instead of re-running the audit', async () => {
  const config = await createDesktopConfig();
  await mkdir(join(config.packageRoot, 'scripts', 'windows'), { recursive: true });
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Install-Node.ps1'),
    '# helper',
  );
  await writeFile(
    join(config.packageRoot, 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1'),
    '# helper',
  );

  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-04-29T10:00:00.000Z'),
  });
  const snapshot = await buildDesktopSetupSnapshot({
    config,
    packaging,
    state: {
      updatedAt: '2026-04-29T10:01:00.000Z',
      lastAction: {
        helperId: 'windows-install-readiness-audit',
        assetId: 'windows-setup-readiness-audit-script',
        label: 'Windows setup readiness audit',
        mode: 'check',
        runState: 'completed',
        status: 'changes_required',
        summary: 'Windows setup readiness audit check finished with changes_required.',
        packagedRelativePath: 'desktop/setup-assets/windows/Check-WindowsSetupReadiness.ps1',
        scriptPath: null,
        requiresElevation: false,
        resumable: true,
        restartRequired: false,
        startedAt: '2026-04-29T10:00:00.000Z',
        completedAt: '2026-04-29T10:01:00.000Z',
        warnings: [],
        plannedActions: ['install_node_lts'],
        appliedChanges: [],
        manualSteps: [],
        interruptions: [],
        error: null,
      },
    },
  }, {
    platform: 'win32',
  });

  assert.equal(snapshot.resumeAction?.helperId, 'windows-node-host-installer');
  assert.equal(snapshot.resumeAction?.mode, 'apply');
  assert.equal(snapshot.resumeAction?.reason, 'changes_required');
  assert.equal(snapshot.resumeAction?.requiresElevation, true);
  assert.match(snapshot.resumeAction?.summary ?? '', /Node\.js LTS host installer/i);
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
  assert.equal(record.pack, 'native_cli_pack');
  assert.equal(record.mode, 'check');
  assert.equal(record.runState, 'completed');
  assert.equal(record.status, 'auth_required');
  assert.equal(record.restartRequired, false);
  assert.equal(record.optionalFollowThroughPack, null);
  assert.deepEqual(record.plannedActions, ['provider:authenticate_claude_code']);
  assert.deepEqual(record.manualSteps, ['Complete the Claude Code sign-in flow, then rerun the packaged setup check.']);
  assert.deepEqual(record.interruptions.map((entry) => entry.kind), ['auth_required']);
  assert.equal(record.error, null);
});

test('runDesktopSetupHelper forwards extra audit arguments when requested by the host', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:06:00.000Z'),
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'windows-install-readiness-audit',
      mode: 'check',
      extraArguments: ['-IncludeWsl:$false', '-IncludeLocalModels:$true'],
    },
  }, {
    platform: 'win32',
    pathExists: async () => true,
    execFile: async (_file, args) => {
      assert.equal(args.includes('-IncludeWsl:$false'), true);
      assert.equal(args.includes('-IncludeLocalModels:$true'), true);
      return {
        stdout: JSON.stringify({
          helper: 'windows-setup-readiness-audit',
          status: 'not_installed',
          warnings: [],
          plannedActions: ['local_model:install_ollama_local_model'],
          appliedChanges: [],
          manualSteps: [],
          interruptions: [],
        }),
        stderr: '',
      };
    },
  });

  assert.equal(record.status, 'not_installed');
  assert.equal(record.pack, 'native_cli_pack');
  assert.equal(record.optionalFollowThroughPack, 'local_model_pack');
  assert.deepEqual(record.plannedActions, ['local_model:install_ollama_local_model']);
});

test('runDesktopSetupHelper forwards Unix audit arguments when requested by the host', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:06:00.000Z'),
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'linux-install-readiness-audit',
      mode: 'check',
      extraArguments: ['--include-local-models'],
    },
  }, {
    platform: 'linux',
    pathExists: async () => true,
    execFile: async (_file, args) => {
      assert.equal(args.includes('--include-local-models'), true);
      return {
        stdout: JSON.stringify({
          helper: 'self-hosted-cli-check',
          platform: 'linux',
          status: 'changes_required',
          warnings: [],
          plannedActions: ['local_model:install_ollama_local_model'],
          manualSteps: [],
          interruptions: [],
        }),
        stderr: '',
      };
    },
  });

  assert.deepEqual(record.plannedActions, ['local_model:install_ollama_local_model']);
});

test('runDesktopSetupHelper preserves docker warm-up interruptions from helper output', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:08:00.000Z'),
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
    execFile: async () => ({
      stdout: JSON.stringify({
        helper: 'windows-setup-readiness-audit',
        status: 'docker_warm_up_required',
        plannedActions: ['docker:start_docker_desktop'],
        warnings: [],
        appliedChanges: [],
        manualSteps: ['Start Docker Desktop and wait for the engine to become ready.'],
        interruptions: [{
          kind: 'docker_warm_up_required',
          summary: 'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.',
          resumable: true,
          requiresRestart: false,
          requiresElevation: false,
        }],
      }),
      stderr: '',
    }),
  });

  assert.equal(record.status, 'docker_warm_up_required');
  assert.equal(record.optionalFollowThroughPack, null);
  assert.deepEqual(record.interruptions.map((entry) => entry.kind), ['docker_warm_up_required']);
  assert.deepEqual(record.plannedActions, ['docker:start_docker_desktop']);
});

test('runDesktopSetupHelper executes packaged Unix helpers through bash', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-04-04T09:02:00.000Z'),
    platforms: ['linux'],
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'linux-install-readiness-audit',
      mode: 'check',
    },
  }, {
    platform: 'linux',
    pathExists: async () => true,
    execFile: async (file, args) => {
      assert.equal(file, 'bash');
      assert.match(args[0] ?? '', /scripts\/linux\/check-installation\.sh$/);
      assert.equal(args.includes('-CheckOnly'), true);
      assert.equal(args.includes('-Json'), true);
      return {
        stdout: JSON.stringify({
          helper: 'linux-install-readiness-audit',
          status: 'ready',
          warnings: [],
          plannedActions: [],
          appliedChanges: [],
          manualSteps: [],
          interruptions: [],
        }),
        stderr: '',
      };
    },
  });

  assert.equal(record.helperId, 'linux-install-readiness-audit');
  assert.equal(record.status, 'ready');
  assert.equal(record.runState, 'completed');
  assert.equal(record.error, null);
});

test('runDesktopSetupHelper preserves elevation-required recovery from an admin-only helper', async () => {
  const config = await createDesktopConfig();
  const packaging = createDesktopPackagingPlan(config, {
    generatedAt: new Date('2026-03-30T11:09:00.000Z'),
  });

  const record = await runDesktopSetupHelper({
    config,
    packaging,
    action: {
      helperId: 'windows-kiro-native-installer',
      mode: 'apply',
    },
  }, {
    platform: 'win32',
    pathExists: async () => true,
    execFile: async () => ({
      stdout: JSON.stringify({
        helper: 'windows-kiro-native-installer',
        status: 'elevation_required',
        plannedActions: ['install_kiro_cli'],
        warnings: [],
        appliedChanges: [],
        manualSteps: ['Resume packaged setup and accept the Windows UAC prompt to install Kiro CLI.'],
        interruptions: [{
          kind: 'elevation_required',
          summary: 'Kiro CLI MSI install requires elevation. Resume packaged setup and accept the Windows UAC prompt.',
          resumable: true,
          requiresRestart: false,
          requiresElevation: true,
        }],
      }),
      stderr: '',
    }),
  });

  assert.equal(record.helperId, 'windows-kiro-native-installer');
  assert.equal(record.mode, 'apply');
  assert.equal(record.status, 'elevation_required');
  assert.equal(record.requiresElevation, true);
  assert.deepEqual(record.plannedActions, ['install_kiro_cli']);
  assert.deepEqual(record.interruptions.map((entry) => entry.kind), ['elevation_required']);
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
