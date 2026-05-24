import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();
const helperPath = join(rootDir, 'scripts', 'windows', 'Install-Antigravity.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Windows Antigravity wrapper owns refresh before invoking the official installer', async () => {
  const script = await readFile(
    join(rootDir, 'scripts', 'windows', 'Install-Antigravity.ps1'),
    'utf8',
  );

  assert.match(
    script,
    /\$installerArguments = @\('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', \$tempScript\)/u,
  );
  assert.match(script, /Remove-Item -LiteralPath \(Resolve-AntigravityExecutablePath\)/u);
  assert.match(script, /\$installResult = Invoke-AntigravityInstaller/u);
  assert.doesNotMatch(script, /Invoke-AntigravityInstaller -ArgumentList/u);
  assert.doesNotMatch(script, /\$upstreamArgs/u);
});

test('Windows Antigravity dry-run reports planned refresh actions', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Force',
    '-DryRun',
    '-Json',
    '-InstallState',
    'installed',
    '-DetectedVersion',
    'agy 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-antigravity-native-installer');
  assert.equal(result.mode, 'force');
  assert.equal(result.status, 'preview');
  assert.equal(result.installed, true);
  assert.deepEqual(result.plannedActions, ['reinstall_antigravity_native']);
  assert.deepEqual(result.appliedChanges, []);
});
