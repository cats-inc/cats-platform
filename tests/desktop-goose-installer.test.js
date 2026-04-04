import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-Goose.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

async function runGooseHelper(args, options = {}) {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    ...args,
  ], options);

  return JSON.parse(stdout);
}

test('Install-Goose reports ready in check mode when Goose is already installed and configured', skipUnlessWindows(), async () => {
  const result = await runGooseHelper([
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'authenticated',
    '-DetectedVersion',
    'goose 1.2.3',
  ]);
  assert.equal(result.helper, 'windows-goose-native-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'goose 1.2.3');
  assert.deepEqual(result.plannedActions, []);
  assert.deepEqual(result.warnings, []);
});

test('Install-Goose reports auth-required in check mode when Goose is installed but not configured yet', skipUnlessWindows(), async () => {
  const result = await runGooseHelper([
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'auth_required',
    '-DetectedVersion',
    'goose 1.2.3',
  ]);
  assert.equal(result.status, 'auth_required');
  assert.equal(Array.isArray(result.interruptions), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
  assert.equal(Array.isArray(result.manualSteps), true);
  assert.equal(result.manualSteps.some((step) => step.includes('OPENAI_API_KEY')), true);
});

test('Install-Goose reports install action in check mode when Goose is missing', skipUnlessWindows(), async () => {
  const result = await runGooseHelper([
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'missing',
  ]);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.installed, false);
  assert.equal(result.plannedActions.includes('install_goose_native'), true);
});

test('Install-Goose records relaunch-required recovery after reinstall work', skipUnlessWindows(), async () => {
  const result = await runGooseHelper([
    '-Force',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'auth_required',
    '-SkipInstaller',
    '-DetectedVersion',
    'goose 1.2.3',
  ]);
  assert.equal(result.status, 'relaunch_required');
  assert.equal(result.restartRequired, false);
  assert.equal(result.appliedChanges.includes('reinstall_goose_native'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'relaunch_required'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
});

test('Install-Goose warns when Windows ARM64 relies on x64 emulation', skipUnlessWindows(), async () => {
  const result = await runGooseHelper([
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-AuthState',
    'authenticated',
    '-DetectedVersion',
    'goose 1.2.3',
  ], {
    env: {
      ...process.env,
      PROCESSOR_ARCHITECTURE: 'AMD64',
      PROCESSOR_ARCHITEW6432: 'ARM64',
    },
  });

  assert.equal(Array.isArray(result.warnings), true);
  assert.equal(
    result.warnings.includes(
      'Goose CLI does not ship a native ARM64 Windows binary. It will run under x64 emulation with reduced performance.',
    ),
    true,
  );
});
