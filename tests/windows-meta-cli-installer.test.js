import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();
const helperPath = join(rootDir, 'scripts', 'windows', 'Install-MetaCli.ps1');
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

async function seedMuseInstall(installDir, { version = '1.0.3-R2198.1', withAgent = true } = {}) {
  await mkdir(installDir, { recursive: true });
  await writeFile(join(installDir, 'muse.cmd'), '@echo off');
  await writeFile(join(installDir, '.muse-launcher.ps1'), '# launcher');
  await writeFile(join(installDir, '.muse-version'), `${version}\n`);
  await writeFile(join(installDir, '.muse-channel'), 'muse-stable\n');
  if (withAgent) {
    await writeFile(join(installDir, `muse-bin-${version}.exe`), 'fake agent binary');
  }
}

test('Windows Meta Muse wrapper invokes the official installer in an isolated scriptblock', async () => {
  const script = await readFile(helperPath, 'utf8');

  assert.match(script, /Invoke-RestMethod 'https:\/\/dev\.meta\.ai\/install\.ps1' \| Invoke-Expression/u);
  assert.match(script, /& \{\s*\$previousErrorActionPreference/u);
  // The launcher runs under Windows PowerShell 5.1, and a PSModulePath
  // inherited from PowerShell 7 breaks its download step. Running the installer
  // under pwsh would reintroduce exactly that failure.
  assert.match(script, /\$powerShellExe = 'powershell\.exe'/u);
  assert.doesNotMatch(script, /Get-Command pwsh\.exe/u);
});

test('Windows Meta Muse helper never executes muse to read a version', async () => {
  const script = await readFile(helperPath, 'utf8');

  // The launcher forwards every argument to the agent binary, so an
  // unrecognised flag opens the interactive TUI and hangs packaged setup.
  assert.match(script, /Get-MuseRecordedVersion/u);
  assert.match(script, /\.muse-version/u);
  assert.doesNotMatch(script, /Get-HiddenCommandText/u);
  assert.doesNotMatch(script, /muse.*--version/u);
});

test('Windows Meta Muse dry-run reports a native refresh without invoking the installer', skipUnlessWindows(), async () => {
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
    '1.0.3-R2198.1',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-muse-native-installer');
  assert.equal(result.mode, 'force');
  assert.equal(result.status, 'preview');
  assert.equal(result.installed, true);
  assert.deepEqual(result.plannedActions, ['reinstall_muse_native']);
  assert.deepEqual(result.appliedChanges, []);
});

test('Windows Meta Muse check reads .muse-version and requires the agent build', skipUnlessWindows(), async () => {
  const installDir = await mkdtemp(join(os.tmpdir(), 'cats-muse-install-'));

  try {
    // The official installer writes the shim and launcher first and downloads
    // the agent last, so "shim but no agent" is a reachable half-install. It
    // must not be reported as installed, or the repair reinstall is skipped.
    await seedMuseInstall(installDir, { withAgent: false });

    const partial = JSON.parse((await execFile(powershellPath, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-CheckOnly', '-Json',
    ], { env: { ...process.env, MUSE_INSTALL_DIR: installDir } })).stdout);

    assert.equal(partial.installed, false, JSON.stringify(partial));
    assert.equal(partial.status, 'not_installed');
    assert.deepEqual(partial.plannedActions, ['install_muse_native']);
    assert.ok(
      partial.warnings.some((warning) => warning.includes('muse-bin')),
      JSON.stringify(partial.warnings),
    );

    await writeFile(join(installDir, 'muse-bin-1.0.3-R2198.1.exe'), 'fake agent binary');

    const ready = JSON.parse((await execFile(powershellPath, [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath, '-CheckOnly', '-Json',
    ], { env: { ...process.env, MUSE_INSTALL_DIR: installDir } })).stdout);

    assert.equal(ready.installed, true, JSON.stringify(ready));
    assert.equal(ready.status, 'ready');
    assert.equal(ready.detectedVersion, '1.0.3-R2198.1');
    assert.equal(ready.commandPath, join(installDir, 'muse.cmd'));
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

test('Windows Meta Muse uninstall removes every downloaded build, not just the shim', skipUnlessWindows(), async () => {
  const installDir = await mkdtemp(join(os.tmpdir(), 'cats-muse-uninstall-'));
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-muse-userprofile-'));
  const authDir = join(userProfile, '.config', 'muse');
  const authPath = join(authDir, 'auth.json');

  try {
    await seedMuseInstall(installDir);
    // A build from an earlier version the launcher still has on disk. Removing
    // only the entry point would leave these behind, and they are ~300MB each.
    await writeFile(join(installDir, 'muse-bin-1.0.2-R2100.4.exe'), 'older agent binary');
    await mkdir(authDir, { recursive: true });
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
        MUSE_INSTALL_DIR: installDir,
        USERPROFILE: userProfile,
        HOME: userProfile,
      },
    });

    const result = JSON.parse(stdout);
    assert.equal(result.helper, 'windows-muse-native-installer');
    assert.equal(result.status, 'uninstalled', JSON.stringify(result));
    await assert.rejects(access(join(installDir, 'muse.cmd')));
    await assert.rejects(access(join(installDir, '.muse-launcher.ps1')));
    await assert.rejects(access(join(installDir, '.muse-version')));
    await assert.rejects(access(join(installDir, '.muse-channel')));
    await assert.rejects(access(join(installDir, 'muse-bin-1.0.3-R2198.1.exe')));
    await assert.rejects(access(join(installDir, 'muse-bin-1.0.2-R2100.4.exe')));
    // Credentials are the operator's, not the installer's.
    assert.equal(await readFile(authPath, 'utf8'), '{"credential":"preserved"}');
    assert.doesNotMatch(JSON.stringify(result), /auth\.json|credential/iu);
  } finally {
    await rm(installDir, { recursive: true, force: true });
    await rm(userProfile, { recursive: true, force: true });
  }
});
