import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-DockerDesktop.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-DockerDesktop reports ready in check mode when Docker Desktop is installed and the engine is ready', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-DockerState',
    'ready',
    '-DetectedVersion',
    'Docker Desktop 4.39.0',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-docker-desktop-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.engineReady, true);
  assert.equal(result.detectedVersion, 'Docker Desktop 4.39.0');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-DockerDesktop reports docker warm-up in check mode when Docker Desktop is installed but not ready yet', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-DockerState',
    'installed_engine_stopped',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'docker_warm_up_required');
  assert.equal(result.plannedActions.includes('start_docker_desktop'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'docker_warm_up_required'), true);
});

test('Install-DockerDesktop reports install action in check mode when Docker Desktop is missing', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-DockerState',
    'missing',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.installed, false);
  assert.equal(result.plannedActions.includes('install_docker_desktop'), true);
});

test('Install-DockerDesktop reports elevation-required before install mutation when the session is unelevated', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Apply',
    '-Json',
    '-DockerState',
    'missing',
    '-AdminState',
    'unelevated',
    '-SkipInstaller',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'elevation_required');
  assert.equal(result.requiresElevation, true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'elevation_required'), true);
});

test('Install-DockerDesktop records docker warm-up recovery after upgrade work', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Upgrade',
    '-Json',
    '-DockerState',
    'installed_engine_stopped',
    '-AdminState',
    'elevated',
    '-SkipInstaller',
    '-DetectedVersion',
    'Docker Desktop 4.39.0',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'docker_warm_up_required');
  assert.equal(result.appliedChanges.includes('upgrade_docker_desktop'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'docker_warm_up_required'), true);
});
