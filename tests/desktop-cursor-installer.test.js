import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-CursorAgent.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-CursorAgent reports ready in check mode when Cursor Agent is already installed', skipUnlessWindows(), async () => {
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
    '-DetectedVersion',
    'cursor-agent 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-cursor-native-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'cursor-agent 1.2.3');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-CursorAgent reports install action in check mode when Cursor Agent is missing', skipUnlessWindows(), async () => {
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
  assert.equal(result.plannedActions.includes('install_cursor_agent_native'), true);
});
