import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Check-WslPrerequisites.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Check-WslPrerequisites reports ready when Windows build, WSL, and distro are already present', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-Distro',
    'Ubuntu',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-wsl-prerequisite-preflight');
  assert.equal(result.status, 'ready');
  assert.equal(result.wslInstalled, true);
  assert.equal(result.distroInstalled, true);
  assert.deepEqual(result.plannedActions, []);
});

test('Check-WslPrerequisites reports missing prerequisite actions when WSL is unavailable', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-WindowsBuild',
    '22621',
    '-WslState',
    'missing',
    '-Distro',
    'Ubuntu',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.plannedActions.includes('enable_wsl_features'), true);
  assert.equal(result.plannedActions.includes('install_wsl_kernel'), true);
  assert.equal(result.requiresElevation, true);
});
