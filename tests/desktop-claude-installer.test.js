import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-ClaudeCode.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-ClaudeCode reports ready in check mode when Claude Code is already installed', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'authenticated',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-claude-native-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'claude 1.2.3');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-ClaudeCode reports auth-required in check mode when Claude Code is installed but not authenticated yet', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'auth_required',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'auth_required');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
});

test('Install-ClaudeCode reports shim cleanup and install recovery when the native installer baseline is not yet clean', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'present',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.plannedActions.includes('remove_legacy_npm_claude_shim'), true);
  assert.equal(result.plannedActions.includes('install_claude_code_native'), true);
});

test('Install-ClaudeCode records restart-required recovery after reinstall work', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'auth_required',
    '-SkipInstaller',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'relaunch_required');
  assert.equal(result.restartRequired, false);
  assert.equal(result.appliedChanges.includes('reinstall_claude_code_native'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'relaunch_required'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
  assert.equal(result.manualSteps.some((step) => step.includes('ANTHROPIC_API_KEY')), true);
});
