import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-NodeCliPack.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

const allPackages = JSON.stringify([
  '@openai/codex',
  '@google/gemini-cli',
  '@github/copilot',
  'opencode-ai',
  '@kilocode/cli',
  '@augmentcode/auggie',
  '@mariozechner/pi-coding-agent',
]);

test('Install-NodeCliPack reports ready in check mode when the native CLI pack is already installed', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-SkipNodeCheck',
    '-SkipPrefixHelper',
    '-InstalledPackagesJson',
    allPackages,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-node-cli-pack');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.packages.every((entry) => entry.plannedAction === 'skip'), true);
  const opencodeIndex = result.packages.findIndex((entry) => entry.id === 'opencode');
  const kiloIndex = result.packages.findIndex((entry) => entry.id === 'kilo');
  assert.ok(opencodeIndex >= 0);
  assert.equal(kiloIndex, opencodeIndex + 1);
});

test('Install-NodeCliPack reports missing and outdated packages in check mode', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-SkipNodeCheck',
    '-SkipPrefixHelper',
    '-InstalledPackagesJson',
    JSON.stringify(['@openai/codex', '@google/gemini-cli']),
    '-OutdatedPackagesJson',
    JSON.stringify(['@google/gemini-cli']),
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(
    result.packages.some((entry) => entry.packageName === '@github/copilot' && entry.plannedAction === 'install'),
    true,
  );
  assert.equal(
    result.packages.some((entry) => entry.packageName === '@kilocode/cli' && entry.plannedAction === 'install'),
    true,
  );
  assert.equal(
    result.packages.some((entry) => entry.packageName === '@google/gemini-cli' && entry.plannedAction === 'skip'),
    true,
  );
});
