import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const windows = { skip: process.platform !== 'win32' };
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
async function run(source) {
  const dir = await mkdtemp(join(tmpdir(), 'cats-installer-observation-'));
  const file = join(dir, 'fixture.ps1');
  await writeFile(file, `Set-StrictMode -Version Latest\n$ErrorActionPreference = 'Stop'\n${source}`);
  return execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { timeout: 25000 });
}
const support = literal(join(process.cwd(), 'scripts/windows/_NativeInstallerSupport.ps1'));

test('native version gates preserve current/newer builds and distinguish Cursor hashes and Junie build IDs', windows, async () => {
  const { stdout } = await run(`. ${support}
@(
 (Test-CatsNativeUpgrade -Provider grok -InstalledVersion 'grok 1.2.3' -LatestVersion '1.2.3'),
 (Test-CatsNativeUpgrade -Provider grok -InstalledVersion '2.0.0' -LatestVersion '1.2.3'),
 (Test-CatsNativeUpgrade -Provider cursor -InstalledVersion '2026.09.16-abcd' -LatestVersion '2026.09.16-defg'),
 (Test-CatsNativeUpgrade -Provider junie -InstalledVersion 'junie 1.0 (252.3.7)' -LatestVersion '252.3.6'),
 (Test-CatsNativeUpgrade -Provider devin -InstalledVersion '1.2.3' -LatestVersion '')
) | ConvertTo-Json`);
  assert.deepEqual(JSON.parse(stdout).map((r) => r.shouldInstall), [false, false, true, false, true]);
});

test('native outcomes do not invent changes from a no-op or a skipped installer', windows, async () => {
  const { stdout } = await run(`. ${support}
$before = [pscustomobject]@{ installed = $true; detectedVersion = '2.0.0' }
@('2.0.0', '1.0.0', '3.0.0') | ForEach-Object {
 $result = [pscustomobject]@{ helper = 'windows-grok-native-installer'; mode = 'apply'; status = 'ready'; installed = $true; detectedVersion = $_; appliedChanges = @('planned') }
 Add-CatsNativeObservation -Result $result -Before $before -Attempted $true -Skipped $false
 $result
} | ConvertTo-Json`);
  const results = JSON.parse(stdout);
  assert.deepEqual(results.map((r) => r.observedChange), ['unchanged', 'downgraded', 'upgraded']);
  assert.deepEqual(results[0].appliedChanges, []);
});

test('vendor exit stays inside its child and returns structured failure', windows, async () => {
  const { stdout } = await run(`. ${support}
Invoke-CatsRemoteInstaller -ScriptText 'param(); [Console]::Error.WriteLine("fixture failure"); exit 7' | ConvertTo-Json`);
  const result = JSON.parse(stdout);
  assert.equal(result.success, false);
  assert.equal(result.exitCode, 7);
  assert.match(result.stderr, /fixture failure/);
});

test('native mutation previews stop before downloads and installers', windows, async () => {
  for (const helper of ['CursorAgent', 'Junie', 'Goose', 'ClaudeCode', 'KiroCli']) {
    const dir = await mkdtemp(join(tmpdir(), 'cats-native-preview-'));
    const path = literal(join(process.cwd(), `scripts/windows/Install-${helper}.ps1`));
    const { stdout } = await run(`$env:USERPROFILE = ${literal(dir)}
$env:LOCALAPPDATA = ${literal(dir)}
function Invoke-RestMethod { throw 'Preview attempted a download' }
& ${path} -Force -DryRun -Json -AllowAdmin -InstallState installed -DetectedVersion '1.2.3'`);
    const result = JSON.parse(stdout);
    assert.equal(result.status, 'preview', helper);
    assert.deepEqual(result.appliedChanges, [], helper);
  }
});

test('npm version comparison does not downgrade newer local or prerelease versions', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  const { stdout } = await run(`. ${library}
function npm { $global:LASTEXITCODE = 0; '2.0.0' }
function Get-NpmCliPackageVersion { $script:version }
@('1.0.0', '2.0.0', '3.0.0', '3.0.0-beta', '2.0.0-beta') | ForEach-Object {
 $script:version = $_
 Test-NpmCliPackageOutdated -PackageName fixture
} | ConvertTo-Json`);
  assert.deepEqual(JSON.parse(stdout), [true, false, false, false, true]);
});

test('npm mutation preview performs neither registry queries nor package mutations', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  const { stdout } = await run(`. ${library}
function npm { throw 'Preview invoked npm' }
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName fixture -CommandName missing-fixture -DisplayName Fixture -Force -DryRun -Json -AllowAdmin -InstallState installed -DetectedVersion '1.2.3' -SkipNpmInvocation`);
  assert.equal(JSON.parse(stdout).status, 'preview');
});

test('a missing npm prefix returns a JSON install plan without creating it', windows, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cats-npm-empty-prefix-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const prefix = join(root, 'prefix');
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  const { stdout } = await run(`. ${library}
$env:npm_config_prefix = ${literal(prefix)}
function Test-NpmCliInstallerAdminGuard { return $true }
function npm {
 if ($args[0] -ne 'list') { throw 'Check attempted a non-list npm command' }
 & $env:ComSpec /d /c 'echo npm error code ENOENT 1>&2 & exit /b 1'
}
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName fixture-package -CommandName cats-missing-npm-fixture -DisplayName Fixture -CheckOnly -Json`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.installed, false);
  assert.equal(result.detectedVersion, '');
  assert.deepEqual(result.plannedActions, ['fixture-package:install']);
  assert.deepEqual(result.appliedChanges, []);
  assert.equal(existsSync(prefix), false);
});

test('a CLI on PATH survives a missing npm prefix with an unknown package version', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  const { stdout } = await run(`. ${library}
function Test-NpmCliInstallerAdminGuard { return $true }
function Resolve-NpmCliCommandPath { return 'C:\\fixture\\legacy-cli.cmd' }
function npm { & $env:ComSpec /d /c 'echo npm error code ENOENT 1>&2 & exit /b 1' }
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName fixture-package -CommandName cats-legacy-npm-fixture -DisplayName Fixture -CheckOnly -Json -InstallState installed`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, '');
  assert.deepEqual(result.plannedActions, []);
  assert.deepEqual(result.appliedChanges, []);
});

test('npm probe permission errors are not mistaken for an absent package', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  await assert.rejects(run(`. ${library}
function Test-NpmCliInstallerAdminGuard { return $true }
function npm { & $env:ComSpec /d /c 'echo npm error code EACCES 1>&2 & exit /b 1' }
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName fixture-package -CommandName cats-missing-npm-fixture -DisplayName Fixture -CheckOnly -Json`), error => {
    assert.equal(error.stdout, '');
    return error.stderr.includes('EACCES');
  });
});

test('non-native PowerShell errors mentioning ENOENT are not suppressed', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  for (const probe of [
    'Test-NpmCliPackageInstalled -PackageName fixture-package -CommandName cats-missing-npm-fixture',
    'Get-NpmCliPackageVersion -PackageName fixture-package',
  ]) {
    await assert.rejects(run(`. ${library}
function npm { throw [System.InvalidOperationException]::new('fixture ENOENT unexpected PowerShell error') }
${probe}`), error => error.stdout === '' && error.stderr.includes('fixture ENOENT unexpected PowerShell error'));
  }
});

test('Pi legacy package probing also tolerates a missing global npm prefix', windows, async () => {
  const library = literal(join(process.cwd(), 'scripts/windows/_NpmCliInstaller.ps1'));
  const { stdout } = await run(`. ${library}
function Test-NpmCliInstallerAdminGuard { return $true }
function Resolve-NpmCliCommandPath { return 'C:\\fixture\\pi.cmd' }
function npm { & $env:ComSpec /d /c 'echo npm error code ENOENT 1>&2 & exit /b 1' }
Invoke-PackagedNpmCliInstall -HelperId fixture -PackageName '@earendil-works/pi-coding-agent' -CommandName cats-legacy-npm-fixture -DisplayName Fixture -CheckOnly -Json -InstallState installed`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.deepEqual(result.plannedActions, []);
  assert.deepEqual(result.appliedChanges, []);
});

test('Node check refreshes registry PATH before detecting a newly installed prerequisite', windows, async () => {
  const helper = literal(join(process.cwd(), 'scripts/windows/Install-Node.ps1'));
  const { stdout } = await run(`
$env:Path = 'stale-desktop-environment'
function Get-Command {
 param($Name)
 if ($Name -in @('node', 'npm') -and $env:Path.Contains([Environment]::GetEnvironmentVariable('Path', 'Machine'))) {
   return [pscustomobject]@{ Source = "fixture-$Name.exe" }
 }
}
& ${helper} -CheckOnly -Json -DetectedVersion '24.0.0'`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.commandPath, 'fixture-node.exe');
});

test('Node without npm still needs the Desktop Node/npm prerequisite', windows, async () => {
  const helper = literal(join(process.cwd(), 'scripts/windows/Install-Node.ps1'));
  const { stdout } = await run(`
function Get-Command {
 param($Name)
 if ($Name -eq 'node') { return [pscustomobject]@{ Source = 'fixture-node.exe' } }
}
& ${helper} -CheckOnly -Json -DetectedVersion '24.0.0'`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.deepEqual(result.plannedActions, ['install_node_lts']);
});

test('GitHub CLI check refreshes registry PATH after installation without restarting Desktop', windows, async () => {
  const helper = literal(join(process.cwd(), 'scripts/windows/Install-GitHubCli.ps1'));
  const { stdout } = await run(`
$env:Path = 'stale-desktop-environment'
function Get-Command {
 param($Name)
 if ($Name -eq 'gh' -and $env:Path.Contains([Environment]::GetEnvironmentVariable('Path', 'Machine'))) {
   return [pscustomobject]@{ Source = 'fixture-gh.exe' }
 }
}
& ${helper} -CheckOnly -Json -DetectedVersion '2.0.0'`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.commandPath, 'fixture-gh.exe');
});

test('Git check refreshes registry PATH after installation without restarting Desktop', windows, async () => {
  const helper = literal(join(process.cwd(), 'scripts/windows/Install-Git.ps1'));
  const { stdout } = await run(`
$env:Path = 'stale-desktop-environment'
function Get-Command {
 param($Name)
 if ($Name -eq 'git' -and $env:Path.Contains([Environment]::GetEnvironmentVariable('Path', 'Machine'))) {
   return [pscustomobject]@{ Source = 'fixture-git.exe' }
 }
}
function git { if ($args[0] -eq 'config') { 'Fixture' } }
& ${helper} -CheckOnly -Json -DetectedVersion '2.47.1'`);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.commandPath, 'fixture-git.exe');
  assert.deepEqual(result.manualSteps, []);
});
