import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-Ollama.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-Ollama reports ready in check mode when Ollama is installed and its API is reachable', skipUnlessWindows(), async () => {
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
    '-ApiState',
    'reachable',
    '-DetectedVersion',
    'ollama version 0.6.5',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-ollama-local-model-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.apiReady, true);
  assert.equal(result.detectedVersion, 'ollama version 0.6.5');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-Ollama reports manual follow-through in check mode when Ollama is installed but the API is not ready', skipUnlessWindows(), async () => {
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
    '-ApiState',
    'unreachable',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.plannedActions.includes('start_ollama_local_model'), true);
  assert.equal(result.manualSteps.length >= 1, true);
});

test('Install-Ollama reports install action in check mode when Ollama is missing', skipUnlessWindows(), async () => {
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
  assert.equal(result.plannedActions.includes('install_ollama_local_model'), true);
});

test('Install-Ollama records follow-through after a forced reinstall when the API is still warming up', skipUnlessWindows(), async () => {
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
    '-ApiState',
    'unreachable',
    '-SkipInstaller',
    '-DetectedVersion',
    'ollama version 0.6.5',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.appliedChanges.includes('reinstall_ollama_local_model'), true);
  assert.equal(result.manualSteps.length >= 1, true);
});
