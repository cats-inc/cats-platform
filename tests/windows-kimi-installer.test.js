import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const rootDir = process.cwd();
const helperPath = join(rootDir, 'scripts', 'windows', 'Install-KimiCode.ps1');
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

/** A user profile of its own, with no Kimi variables inherited from the developer. */
function isolatedEnv(userProfile, extra = {}) {
  const env = { ...process.env, USERPROFILE: userProfile, HOME: userProfile, LOCALAPPDATA: join(userProfile, 'AppData', 'Local') };
  for (const name of ['KIMI_INSTALL_DIR', 'KIMI_CODE_HOME', 'KIMI_VERSION', 'KIMI_NO_MODIFY_PATH', 'KIMI_SHELL_PATH']) {
    delete env[name];
  }
  return { ...env, ...extra };
}

function runHelper(args, env) {
  return execFile(powershellPath, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath, ...args], {
    env,
    timeout: 60000,
  });
}

test('Windows Kimi Code wrapper runs the official global installer non-interactively from a fixed path', async () => {
  const script = await readFile(helperPath, 'utf8');
  const support = await readFile(join(rootDir, 'scripts', 'windows', '_NativeInstallerSupport.ps1'), 'utf8');

  assert.match(script, /'https:\/\/code\.kimi\.ai\/kimi-code\/install\.ps1'/u);
  assert.match(script, /Invoke-CatsRemoteInstaller -ScriptText/u);
  assert.match(support, /'-NonInteractive'/u, 'the installer child must not wait on Read-Host');
  assert.match(script, /Join-Path \$env:USERPROFILE '\.kimi-code'/u);
  assert.match(script, /KIMI_INSTALL_DIR/u);
  assert.match(script, /KIMI_NO_MODIFY_PATH/u);
  assert.match(script, /-TimeoutMs \$KimiVersionProbeTimeoutMs/u);
  assert.doesNotMatch(script, /Get-Command kimi/u, 'a kimi elsewhere on PATH is not the native install');
  assert.doesNotMatch(script, /Remove-Item[^\n]*\.kimi-code'\)/u);
  assert.match(support, /kimi \{ return Get-KimiCodeLatestVersion \}/u);
  assert.match(support, /"\$BaseUrl\/latest"/u);
});

test('Windows Kimi Code dry-run reports a native refresh without invoking the installer', skipUnlessWindows(), async () => {
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-kimi-preview-'));
  try {
    const { stdout } = await runHelper([
      '-Force', '-DryRun', '-Json', '-AllowAdmin', '-InstallState', 'installed', '-DetectedVersion', '2.5.3',
    ], isolatedEnv(userProfile));

    const result = JSON.parse(stdout);
    assert.equal(result.helper, 'windows-kimi-native-installer');
    assert.equal(result.mode, 'force');
    assert.equal(result.status, 'preview');
    assert.equal(result.installed, true);
    assert.deepEqual(result.plannedActions, ['reinstall_kimi_native']);
    assert.deepEqual(result.appliedChanges, []);
    assert.deepEqual(result.manualSteps, []);
  } finally {
    await rm(userProfile, { recursive: true, force: true });
  }
});

test('Windows Kimi Code check counts only the fixed kimi.exe, never one on PATH', skipUnlessWindows(), async () => {
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-kimi-check-'));
  const otherBin = await mkdtemp(join(os.tmpdir(), 'cats-kimi-path-'));
  const kimiBin = join(userProfile, '.kimi-code', 'bin');
  try {
    await writeFile(join(otherBin, 'kimi.exe'), 'legacy kimi-cli or npm build');
    const env = isolatedEnv(userProfile, { PATH: `${otherBin};${process.env.PATH}` });

    const missing = JSON.parse((await runHelper(['-CheckOnly', '-Json', '-AllowAdmin'], env)).stdout);
    assert.equal(missing.installed, false, JSON.stringify(missing));
    assert.equal(missing.status, 'not_installed');
    assert.equal(missing.commandPath, join(kimiBin, 'kimi.exe'));
    assert.deepEqual(missing.plannedActions, ['install_kimi_native']);

    await mkdir(kimiBin, { recursive: true });
    await writeFile(join(kimiBin, 'kimi.exe'), 'fixture');
    // A supplied version skips starting the fixture.
    const installed = JSON.parse((await runHelper(['-CheckOnly', '-Json', '-AllowAdmin', '-DetectedVersion', '2.5.3'], env)).stdout);
    assert.equal(installed.installed, true, JSON.stringify(installed));
    assert.equal(installed.status, 'ready');
    assert.equal(installed.detectedVersion, '2.5.3');

    const custom = join(userProfile, 'custom-kimi');
    const relocated = JSON.parse((await runHelper(['-CheckOnly', '-Json', '-AllowAdmin'], { ...env, KIMI_INSTALL_DIR: custom })).stdout);
    assert.equal(relocated.installed, false);
    assert.equal(relocated.commandPath, join(custom, 'bin', 'kimi.exe'));
  } finally {
    await rm(userProfile, { recursive: true, force: true });
    await rm(otherBin, { recursive: true, force: true });
  }
});

test('Windows Kimi Code upgrade skips the installer when the published version is installed', skipUnlessWindows(), async () => {
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-kimi-upgrade-'));
  try {
    // KIMI_VERSION is what the official installer would fetch, so the gate asks no endpoint.
    const { stdout } = await runHelper([
      '-Upgrade', '-Json', '-AllowAdmin', '-InstallState', 'installed', '-DetectedVersion', '2.5.3',
    ], isolatedEnv(userProfile, { KIMI_VERSION: '2.5.3' }));

    const result = JSON.parse(stdout);
    assert.equal(result.status, 'ready', JSON.stringify(result));
    assert.deepEqual(result.plannedActions, []);
    assert.deepEqual(result.appliedChanges, []);
    assert.equal(result.observedChange, 'unchanged');
    assert.deepEqual(result.manualSteps, []);
  } finally {
    await rm(userProfile, { recursive: true, force: true });
  }
});

test('Windows Kimi Code uninstall removes the binary and its backups but keeps ~/.kimi-code data', skipUnlessWindows(), async () => {
  const userProfile = await mkdtemp(join(os.tmpdir(), 'cats-kimi-uninstall-'));
  const otherBin = await mkdtemp(join(os.tmpdir(), 'cats-kimi-other-'));
  const kimiHome = join(userProfile, '.kimi-code');
  const kimiBin = join(kimiHome, 'bin');
  const binaries = ['kimi.exe', 'kimi.exe.bak', 'kimi.exe.0a1b2c3d.bak', 'fd.exe'].map((name) => join(kimiBin, name));
  const kept = {
    [join(kimiHome, 'config.toml')]: 'default_model = "fixture"\n',
    [join(kimiHome, 'credentials', 'kimi-code.json')]: '{"refresh_token":"preserved"}',
    [join(kimiHome, 'sessions', 'session.json')]: '{}',
    [join(otherBin, 'kimi.exe')]: 'someone else',
  };

  try {
    await mkdir(kimiBin, { recursive: true });
    for (const path of binaries) await writeFile(path, 'fixture');
    for (const [path, content] of Object.entries(kept)) {
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, content);
    }

    const { stdout } = await runHelper(['-Uninstall', '-Json', '-InstallState', 'missing'],
      isolatedEnv(userProfile, { PATH: `${otherBin};${process.env.PATH}` }));

    const result = JSON.parse(stdout);
    assert.equal(result.helper, 'windows-kimi-native-installer');
    assert.equal(result.status, 'uninstalled', JSON.stringify(result));
    for (const path of binaries) await assert.rejects(access(path), path);
    for (const [path, content] of Object.entries(kept)) {
      assert.equal(await readFile(path, 'utf8'), content, path);
    }
    assert.doesNotMatch(JSON.stringify(result), /credentials|config\.toml|sessions/u);
  } finally {
    await rm(userProfile, { recursive: true, force: true });
    await rm(otherBin, { recursive: true, force: true });
  }
});
