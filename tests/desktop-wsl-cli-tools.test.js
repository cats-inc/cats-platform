import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-WSLCLITools.ps1');
const allProviders = JSON.stringify([
  'claude',
  'cursor',
  'goose',
  'junie',
  'kiro',
  'codex',
  'gemini',
  'copilot',
  'opencode',
  'kilo',
  'auggie',
  'pi',
]);

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only orchestration helper' };
  }
  return {};
}

test('Install-WSLCLITools reports ready in check mode when the full provider baseline is already present', skipUnlessWindows(), async () => {
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
    '-NodeState',
    'ready',
    '-InstalledProvidersJson',
    allProviders,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-wsl-cli-tools');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.nodeReady, true);
  assert.equal(result.providers.every((entry) => entry.plannedAction === 'skip'), true);
});

test('Install-WSLCLITools preserves restart-required substrate follow-through', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Apply',
    '-Json',
    '-WslState',
    'missing',
    '-SkipEnvironmentMutation',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'restart_required');
  assert.equal(result.wslEnvironment.status, 'restart_required');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'restart_required'), true);
});
