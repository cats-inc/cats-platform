import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-Junie.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-Junie reports ready in check mode when Junie is already installed and signed in', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'authenticated',
    '-DetectedVersion',
    'junie 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-junie-native-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'junie 1.2.3');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-Junie reports auth-required in check mode when Junie is installed but not signed in yet', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'auth_required',
    '-DetectedVersion',
    'junie 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'auth_required');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
  assert.equal(result.manualSteps.some((step) => step.includes('JUNIE_API_KEY')), true);
});

test('Install-Junie reports install action in check mode when Junie is missing', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'missing',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.installed, false);
  assert.equal(result.plannedActions.includes('install_junie_native'), true);
});

test('Install-Junie records relaunch-required recovery after reinstall work', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Force',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'auth_required',
    '-SkipInstaller',
    '-DetectedVersion',
    'junie 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'relaunch_required');
  assert.equal(result.restartRequired, false);
  assert.equal(result.appliedChanges.includes('reinstall_junie_native'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'relaunch_required'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
});
