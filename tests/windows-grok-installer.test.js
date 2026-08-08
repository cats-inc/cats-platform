import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();
const helperPath = join(rootDir, 'scripts', 'windows', 'Install-Grok.ps1');
const powershellPath = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

function skipUnlessWindows() {
  return process.platform === 'win32'
    ? {}
    : { skip: 'Windows-only packaged setup helper' };
}

test('Windows Grok wrapper invokes the official installer in an isolated scriptblock', async () => {
  const script = await readFile(helperPath, 'utf8');

  assert.match(script, /Invoke-RestMethod 'https:\/\/x\.ai\/cli\/install\.ps1' \| Invoke-Expression/u);
  assert.match(script, /& \{\s*\$previousErrorActionPreference/u);
  assert.match(script, /Resolve-GrokInstallerAliasPath/u);
  assert.match(script, /-ExtraUserOwnedPaths @\(\(Resolve-GrokInstallerAliasPath\)\)/u);
  assert.doesNotMatch(script, /Get-Command agent/u);
});

test('Windows Grok dry-run reports a native refresh without invoking the installer', skipUnlessWindows(), async () => {
  const { stdout } = await execFile(powershellPath, [
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
    'grok 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-grok-native-installer');
  assert.equal(result.mode, 'force');
  assert.equal(result.status, 'preview');
  assert.equal(result.installed, true);
  assert.deepEqual(result.plannedActions, ['reinstall_grok_native']);
  assert.deepEqual(result.appliedChanges, []);
});

test('Windows Grok uninstall removes only the fixed grok and adjacent agent paths', skipUnlessWindows(), async () => {
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-grok-userprofile-'));
  const unrelatedBin = await mkdtemp(join(os.tmpdir(), 'cats-grok-agent-bin-'));
  const grokBin = join(userProfile, '.grok', 'bin');
  const grokPath = join(grokBin, 'grok.exe');
  const installerAliasPath = join(grokBin, 'agent.exe');
  const unrelatedAgentPath = join(unrelatedBin, 'agent.exe');
  const authPath = join(userProfile, '.grok', 'auth.json');

  try {
    await mkdir(grokBin, { recursive: true });
    await writeFile(grokPath, 'fake grok binary');
    await writeFile(installerAliasPath, 'installer-owned alias');
    await writeFile(unrelatedAgentPath, 'unrelated agent');
    await writeFile(authPath, '{"credential":"preserved"}');

    const { stdout } = await execFile(powershellPath, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath,
      '-Uninstall',
      '-Json',
      '-InstallState',
      'missing',
    ], {
      env: {
        ...process.env,
        USERPROFILE: userProfile,
        HOME: userProfile,
        PATH: unrelatedBin,
      },
    });

    const result = JSON.parse(stdout);
    assert.equal(result.helper, 'windows-grok-native-installer');
    assert.equal(result.status, 'uninstalled', JSON.stringify(result));
    await assert.rejects(access(grokPath));
    await assert.rejects(access(installerAliasPath));
    await access(unrelatedAgentPath);
    assert.equal(await readFile(authPath, 'utf8'), '{"credential":"preserved"}');
    assert.doesNotMatch(JSON.stringify(result), /auth\.json|credential/iu);
  } finally {
    await rm(userProfile, { recursive: true, force: true });
    await rm(unrelatedBin, { recursive: true, force: true });
  }
});
