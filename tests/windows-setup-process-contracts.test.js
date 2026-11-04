import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback), windows = { skip: process.platform !== 'win32' };
const literal = value => `'${value.replaceAll("'", "''")}'`;
async function run(t, body, env = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-setup-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'entry.ps1');
  await writeFile(file, '\uFEFF$ErrorActionPreference = "Stop"\n' + body);
  try {
    return { ...await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
      env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 25000,
    }), code: 0 };
  } catch (error) { return error; }
}
async function staged(t, name, hiddenOverride = '') {
  const root = await mkdtemp(join(tmpdir(), 'cats-installer-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, `Install-${name}.ps1`);
  await writeFile(file, await readFile(`scripts/windows/Install-${name}.ps1`, 'utf8'));
  await writeFile(join(root, '_HiddenProcess.ps1'), await readFile('scripts/windows/_HiddenProcess.ps1', 'utf8') + '\n' + hiddenOverride);
  return { root, file };
}

test('Windows argv roundtrips empty values, quotes and trailing backslashes', windows, async t => {
  const args = ['', 'two words', 'C:\\path with spaces\\', 'a"b', 'a\\"b', 'plain\\'];
  const result = await run(t, `. ${literal(join(process.cwd(), 'scripts/windows/_HiddenProcess.ps1'))}
$result = Invoke-HiddenCommand -FileName ${literal(process.execPath)} -ArgumentList @('-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ${args.map(literal).join(', ')})
if ($result.ExitCode -ne 0) { throw $result.ErrorOutput }
$result.Output`);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
});

for (const helper of ['Node', 'Git', 'GitHubCli', 'VcRedist']) {
  for (const mode of ['Apply', 'Upgrade', 'Force', 'already-installed']) {
    test(`${helper} ${mode} DryRun never reaches elevation, downloads or an installer`, windows, async t => {
      const markerRoot = await mkdtemp(join(tmpdir(), 'cats-dryrun-marker-'));
      t.after(() => rm(markerRoot, { recursive: true, force: true }));
      const marker = join(markerRoot, 'mutation.txt');
      const blocked = `[IO.File]::AppendAllText(${literal(marker)}, 'mutation'); throw 'Mutation blocked by fixture'`;
      const { file } = await staged(t, helper, `function Invoke-HiddenCommand { ${blocked} }`);
      const result = await run(t, `function winget { }
function node { 'v99.0.0' }; function npm { '99.0.0' }; function git { 'git version 99.0.0' }; function gh { 'gh version 99.0.0' }
function Start-Process { ${blocked} }
function Invoke-RestMethod { ${blocked} }
function Invoke-WebRequest { ${blocked} }
& ${literal(file)} -${mode === 'already-installed' ? 'Apply' : mode} -DryRun -Json -InstallState ${mode === 'already-installed' ? 'installed' : 'missing'} -DetectedVersion 99.0.0
exit $LASTEXITCODE`);
      assert.equal(result.code, 0, result.stderr);
      const data = JSON.parse(result.stdout);
      assert.equal(data.status, 'preview');
      assert.deepEqual(data.appliedChanges, []);
      assert.equal(data.plannedActions.length, mode === 'already-installed' ? 0 : 1);
      assert.equal(existsSync(marker), false, 'no mutation entry point was reached');
    });
  }
}

for (const [helper, functionName] of [['Antigravity', 'Invoke-AntigravityInstaller'], ['Grok', 'Invoke-GrokInstaller'], ['MetaCli', 'Invoke-MuseInstaller'], ['Goose', 'Invoke-GooseInstaller']]) {
  for (const code of [0, 7]) {
    test(`${helper} preserves child exit ${code} with a spaced Unicode TEMP path`, windows, async t => {
      const temp = await mkdtemp(join(tmpdir(), "cats Owner's Temp 測試-"));
      t.after(() => rm(temp, { recursive: true, force: true }));
      const installer = `param(); [Console]::Error.WriteLine('fixture-result'); exit ${code}`;
      const result = await run(t, `. ${literal(join(process.cwd(), 'scripts/windows/_NativeInstallerSupport.ps1'))}
$CatsTls12Prologue = ${literal(`function Invoke-RestMethod { ${literal(installer)} }`)}
function Invoke-RestMethod { ${literal(installer)} }
$SkipInstaller = $false
$tokens=$null; $errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${literal(join(process.cwd(), `scripts/windows/Install-${helper}.ps1`))},[ref]$tokens,[ref]$errors)
$fn=$ast.Find({param($item) $item -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $item.Name -eq ${literal(functionName)}},$true)
if ($null -eq $fn) { throw 'Missing installer function' }
Invoke-Expression $fn.Extent.Text
${functionName} | ConvertTo-Json -Depth 5`, { TEMP: temp, TMP: temp });
      assert.equal(result.code, 0, result.stderr);
      const data = JSON.parse(result.stdout);
      assert.equal(data.success, code === 0);
      assert.equal(data.exitCode, code);
      assert.match(data.stderr, /fixture-result/u);
    });
  }
}

for (const helper of ['Node', 'GitHubCli', 'VcRedist']) {
  for (const code of [0, 3010, 1603]) {
    test(`${helper} handles installer exit ${code} without losing reboot semantics`, windows, async t => {
      const { root, file } = await staged(t, helper, `function Invoke-HiddenCommand {
 param($FileName,$ArgumentList)
 if ($FileName -eq 'winget') { return [pscustomobject]@{ ExitCode=777; Output=''; ErrorOutput='' } }
 if ($FileName -in @('msiexec.exe', (Join-Path $env:TEMP 'vc_redist.x64.exe'))) { return [pscustomobject]@{ ExitCode=${code}; Output=''; ErrorOutput='' } }
 throw 'Unexpected native process blocked'
}`);
      const result = await run(t, `function winget { }
function node { 'v99.0.0' }; function npm { '99.0.0' }; function gh { 'gh version 99.0.0' }
function Invoke-RestMethod { param($Uri,$Headers,$TimeoutSec,[switch]$UseBasicParsing)
 if ($Uri -like '*nodejs.org*') { return @([pscustomobject]@{lts='fixture';version='v99.0.0'}) }
 [pscustomobject]@{tag_name='v99.0.0';assets=@([pscustomobject]@{name='gh_windows_amd64.msi';browser_download_url='https://fixture.invalid/installer'})}
}
function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing) [IO.File]::WriteAllText($OutFile,'harmless fixture') }
& ${literal(file)} -Apply -Json -InstallState missing -DetectedVersion 99.0.0 -SkipElevation
exit $LASTEXITCODE`, { TEMP: root, TMP: root });
      assert.equal(result.code, code === 1603 ? 1 : 0, result.stderr);
      const data = JSON.parse(result.stdout);
      assert.equal(data.status, code === 1603 ? 'failed' : code === 3010 ? 'restart_required' : 'ready');
      assert.equal(data.restartRequired, code === 3010);
      if (code === 3010) {
        assert.equal(data.interruptions[0].kind, 'restart_required');
        assert.equal(data.interruptions[0].requiresRestart, true);
        assert.match(data.warnings.join('\n'), /system restart/u);
      }
    });
  }
}
