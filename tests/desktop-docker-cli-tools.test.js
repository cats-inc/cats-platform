import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-DockerCLITools.ps1');
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

test('Install-DockerCLITools reports ready in check mode when the full provider baseline is already present', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-Container',
    'cats-cli-test',
    '-DockerState',
    'ready',
    '-ContainerState',
    'running',
    '-NodeState',
    'ready',
    '-InstalledProvidersJson',
    allProviders,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-docker-cli-tools');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.containerRunning, true);
  assert.equal(result.providers.every((entry) => entry.plannedAction === 'skip'), true);
});

test('Install-DockerCLITools preserves Docker warm-up follow-through from the desktop helper', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-Container',
    'cats-cli-test',
    '-DockerState',
    'installed_engine_stopped',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'docker_warm_up_required');
  assert.equal(result.dockerDesktop.status, 'docker_warm_up_required');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'docker_warm_up_required'), true);
});

test('Upgrade-CLITools keeps WSL and Docker aggregate helpers in the repo-owned surface', async () => {
  const script = await readFile(
    join(process.cwd(), 'scripts', 'windows', 'Upgrade-CLITools.ps1'),
    'utf8',
  );

  assert.match(script, /Install-WSLCLITools\.ps1/u);
  assert.match(script, /Install-DockerCLITools\.ps1/u);
  assert.match(script, /Install-NodeCliPack\.ps1/u);
});
