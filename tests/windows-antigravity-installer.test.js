import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
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

test('Windows Antigravity uninstall dry-run stays scoped to the user binary', skipUnlessWindows(), async () => {
  const tempLocalAppData = await mkdtemp(join(os.tmpdir(), 'cats-antigravity-localappdata-'));
  try {
    const agyPath = join(tempLocalAppData, 'agy', 'bin', 'agy.exe');
    const userProfilePath = join(tempLocalAppData, 'UserProfile');
    const settingsPath = join(
      userProfilePath,
      '.gemini',
      'antigravity-cli',
      'settings.json',
    );
    await mkdir(join(tempLocalAppData, 'agy', 'bin'), { recursive: true });
    await mkdir(join(userProfilePath, '.gemini', 'antigravity-cli'), { recursive: true });
    await writeFile(agyPath, 'fake agy binary');
    await writeFile(settingsPath, '{"auth":"preserved"}');

    const { stdout } = await execFile('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath,
      '-Uninstall',
      '-DryRun',
      '-Json',
      '-InstallState',
      'installed',
    ], {
      env: {
        ...process.env,
        LOCALAPPDATA: tempLocalAppData,
        USERPROFILE: userProfilePath,
        HOME: userProfilePath,
      },
    });

    const result = JSON.parse(stdout);
    assert.equal(result.helper, 'windows-antigravity-native-installer');
    assert.equal(result.mode, 'uninstall');
    assert.equal(result.status, 'preview');
    assert.equal(result.installed, true);
    assert.deepEqual(result.plannedActions, [`remove:${agyPath}`]);
    assert.deepEqual(result.appliedChanges, []);
    assert.doesNotMatch(JSON.stringify(result), /settings|auth|plugin|\.gemini/iu);
    assert.equal(await readFile(settingsPath, 'utf8'), '{"auth":"preserved"}');
  } finally {
    await rm(tempLocalAppData, { recursive: true, force: true });
  }
});
