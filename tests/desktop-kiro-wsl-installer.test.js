import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-KiroWslCli.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-KiroWslCli reports ready in check mode when WSL and Kiro are already configured', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-DependencyState',
    'ready',
    '-InstallState',
    'installed',
    '-PathState',
    'configured',
    '-AliasState',
    'configured',
    '-DetectedVersion',
    'kiro-cli 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-kiro-wsl-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'kiro-cli 1.2.3');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-KiroWslCli reports install action in check mode when Kiro is missing', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-DependencyState',
    'ready',
    '-InstallState',
    'missing',
    '-PathState',
    'missing',
    '-AliasState',
    'missing',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.plannedActions.includes('install_kiro_cli_wsl'), true);
});

test('Install-KiroWslCli installs and repairs the WSL profile when Kiro is missing', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Apply',
    '-Json',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-DependencyState',
    'ready',
    '-InstallState',
    'missing',
    '-PathState',
    'missing',
    '-AliasState',
    'missing',
    '-SkipInstaller',
    '-SkipProfileRepair',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.appliedChanges.includes('install_kiro_cli_wsl'), true);
  assert.equal(result.appliedChanges.includes('ensure_wsl_local_bin_path'), true);
  assert.equal(result.appliedChanges.includes('ensure_kc_alias'), true);
  assert.equal(
    result.manualSteps.some((step) => step.includes('Kiro sign-in flow')),
    true,
  );
});
