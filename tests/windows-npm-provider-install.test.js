import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const windows = { skip: process.platform !== 'win32' };
const literal = value => `'${value.replaceAll("'", "''")}'`;

async function fixture(t, { policy = true, packageName = 'cline', output = 'cline 3.0.74',
  exit = 0, installedVersion = '3.0.74', configExit = 0, configJson, stderr = false,
  force = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "cats npm Owner's 測試-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = join(root, 'fixture.cmd');
  await writeFile(cli, `@echo off\r\n${output ? `echo ${output}${stderr ? ' 1>&2' : ''}\r\n` : ''}exit /b ${exit}\r\n`);
  const log = join(root, 'install.json');
  const entry = join(root, 'entry.ps1');
  const config = configJson ?? JSON.stringify(policy ? { 'allow-scripts': [] } : {});
  await writeFile(entry, `\uFEFFSet-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. ${literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'))}
function Test-NpmCliInstallerAdminGuard { $true }
function Test-NpmCliRuntimeAvailable { $true }
function Test-NpmCliPackageInstalled { $true }
function Get-NpmCliPackageVersion { ${literal(installedVersion)} }
function Resolve-NpmCliCommandPath { ${literal(cli)} }
function npm {
  $global:LASTEXITCODE = 0
  switch ($args[0]) {
    view { '3.0.74' }
    config {
      if (($args -join ' ') -ne 'config list --long --json') { throw 'Unexpected config mutation' }
      $global:LASTEXITCODE = ${configExit}
      ${literal(config)}
    }
    install { ConvertTo-Json -InputObject @($args) | Set-Content -LiteralPath ${literal(log)} }
    default { throw 'Unexpected npm command' }
  }
}
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName ${literal(packageName)} -CommandName fixture -DisplayName Fixture ${force ? '-Force -InstallState installed' : '-Apply -InstallState missing'} -Json
`);
  let result;
  try {
    result = { ...await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', entry], {
      windowsHide: true, timeout: 20000, encoding: 'utf8',
    }), code: 0 };
  } catch (error) { result = error; }
  const args = await readFile(log, 'utf8').then(JSON.parse, () => null);
  return { ...result, args };
}

test('Repair reinstalls a current provider and verifies its command', windows, async t => {
  const result = await fixture(t, { force: true });
  assert.equal(result.code, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.appliedChanges, ['cline:reinstall']);
  assert.ok(result.args.includes('--allow-scripts=cline@3.0.74'));
});

test('a non-returning version command is killed within its probe deadline', windows, async t => {
  const root = await mkdtemp(join(tmpdir(), 'cats-npm-probe-timeout-'));
  const cli = join(root, 'fixture.ps1');
  const marker = join(root, 'pid.txt');
  t.after(async () => {
    const pid = await readFile(marker, 'utf8').then(Number, () => null);
    if (pid) { try { process.kill(pid); } catch {} }
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(cli, `[IO.File]::WriteAllText(${literal(marker)}, [string]$PID); Start-Sleep -Seconds 90`);
  const entry = join(root, 'entry.ps1');
  await writeFile(entry, `$ErrorActionPreference = 'Stop'
. ${literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'))}
$script:invoke = (Get-Command Invoke-HiddenCommand).ScriptBlock
function Invoke-HiddenCommand {
  param($FileName, $ArgumentList, $TimeoutMs)
  if ($FileName -like '*taskkill.exe') {
    & $script:invoke -FileName $FileName -ArgumentList $ArgumentList
  } else {
    if ($TimeoutMs -ne 30000) { throw 'Expected bounded version probe' }
    & $script:invoke -FileName $FileName -ArgumentList $ArgumentList -TimeoutMs 3000
  }
}
$valid = Test-NpmCliCommandVersion -CommandPath ${literal(cli)} -Version '3.0.74'
$running = Test-Path ${literal(marker)}
if ($running) { $running = $null -ne (Get-Process -Id ([int][IO.File]::ReadAllText(${literal(marker)})) -ErrorAction SilentlyContinue) }
@{ valid = $valid; running = $running; started = (Test-Path ${literal(marker)}) } | ConvertTo-Json
`);
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', entry], {
    windowsHide: true, timeout: 20000,
  });
  assert.deepEqual(JSON.parse(stdout), { valid: false, running: false, started: true });
});

for (const [policy, packageName] of [[true, 'cline'], [true, '@kilocode/cli'], [false, 'cline']]) {
  test(`npm provider install respects normal engine policy and ${policy ? 'scoped script approval for' : 'older npm for'} ${packageName}`, windows, async t => {
    const result = await fixture(t, { policy, packageName });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'ready');
    assert.deepEqual(result.args, ['install', '-g', '--include=optional', '--fetch-retries=0',
      '--fetch-timeout=30000', `${packageName}@3.0.74`, ...(policy ? [`--allow-scripts=${packageName}@3.0.74`] : [])]);
  });
}

for (const options of [{ output: '' }, { output: 'cline 3.0.73' }, { exit: 7 }, { installedVersion: '3.0.73' }]) {
  test(`npm provider install cannot claim ready for a broken or stale CLI ${JSON.stringify(options)}`, windows, async t => {
    const result = await fixture(t, options);
    assert.notEqual(result.code, 0);
    assert.equal(result.stdout.trim(), '');
    assert.match(result.stderr, /could not run|installation verification failed/u);
  });
}

for (const options of [{ output: 'v3.0.74' }, { output: 'cline 3.0.74', stderr: true }]) {
  test(`CLI version verification accepts upstream output ${JSON.stringify(options)}`, windows, async t => {
    const result = await fixture(t, options);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'ready');
  });
}

for (const options of [{ configExit: 7 }, { configJson: 'not JSON' }]) {
  test(`an unreadable npm policy fails before any installation ${JSON.stringify(options)}`, windows, async t => {
    const result = await fixture(t, options);
    assert.notEqual(result.code, 0);
    assert.equal(result.args, null);
  });
}
