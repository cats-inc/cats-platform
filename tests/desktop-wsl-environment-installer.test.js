import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-WslUbuntuEnvironment.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-WslUbuntuEnvironment reports ready in check mode when WSL and Ubuntu are already present', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-wsl-environment-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.plannedActions, []);
});

test('Install-WslUbuntuEnvironment reports restart-required after simulating WSL substrate enablement', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Apply',
    '-Json',
    '-WindowsBuild',
    '22621',
    '-WslState',
    'missing',
    '-SkipFeatureMutation',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'restart_required');
  assert.equal(result.restartRequired, true);
  assert.equal(result.appliedChanges.includes('enable_wsl_features'), true);
  assert.equal(result.appliedChanges.includes('install_wsl_kernel'), true);
  assert.equal(result.appliedChanges.includes('set_default_wsl_version_2'), true);
  assert.equal(result.plannedActions.includes('install_distro:Ubuntu'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'restart_required'), true);
});

test('Install-WslUbuntuEnvironment installs the distro after WSL is already present', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Apply',
    '-Json',
    '-WindowsBuild',
    '22621',
    '-WslState',
    'installed_no_distro',
    '-SkipDistroInstall',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'first_wsl_boot_required');
  assert.equal(result.restartRequired, false);
  assert.equal(result.distroInstalled, true);
  assert.equal(result.appliedChanges.includes('install_distro:Ubuntu'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'first_wsl_boot_required'), true);
  assert.equal(
    result.manualSteps.some((step) => step.includes('complete first-user setup')),
    true,
  );
});
