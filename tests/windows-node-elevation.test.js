import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(callback);
const windows = { skip: process.platform !== 'win32' };
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const ready = { helper: 'windows-node-host-installer', mode: 'apply', status: 'ready', installed: true,
  detectedVersion: '24.0.0', appliedChanges: ['fixture_install'], warnings: [], interruptions: [] };

async function fixture(t, { scriptFolder = 'Cats Bot', tempFolder = "Owner's Temp", outcome = 'child' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats-node-elevation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = join(root, scriptFolder);
  const temp = join(root, tempFolder);
  await Promise.all([mkdir(scripts), mkdir(temp)]);
  const source = (await readFile('scripts/windows/Install-Node.ps1', 'utf8')).replaceAll('\r\n', '\n');
  const admin = '$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).\n' +
    '  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)';
  assert.ok(source.includes(admin), 'the fixture must force only the administrator observation');
  // Keep the production relay and installer logic; select its unelevated branch
  // regardless of the test account. SkipNodeProbe prevents every real installer.
  await writeFile(join(scripts, 'Install-Node.ps1'), source.replace(admin, '$isAdmin = $false'));
  await copyFile('scripts/windows/_HiddenProcess.ps1', join(scripts, '_HiddenProcess.ps1'));
  const invoke = outcome === 'child'
    ? `Microsoft.PowerShell.Management\\Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput ${literal(join(root, 'child.stdout'))} -RedirectStandardError ${literal(join(root, 'child.stderr'))}`
    : outcome === 'cancel'
      ? "throw [ComponentModel.Win32Exception]::new(1223, 'Fixture UAC cancelled')"
      : ['empty', 'invalid', 'no-status', 'ready', 'locked'].includes(outcome)
        ? `$index = [Array]::IndexOf($ArgumentList, '-ResultRelayPath')
  $path = $ArgumentList[$index + 1].Trim('"')
  [IO.File]::WriteAllText($path, ${literal({ empty: '', invalid: 'not JSON', 'no-status': '{"installed":true}', ready: JSON.stringify(ready), locked: JSON.stringify(ready) }[outcome])})
  ${outcome === 'locked' ? '$script:lockedRelay = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)' : ''}
  [pscustomobject]@{ ExitCode = 0 }`
        : `[pscustomobject]@{ ExitCode = ${Number(outcome)} }`;
  const entry = join(root, 'invoke.ps1');
  await writeFile(entry, `\uFEFF$ErrorActionPreference = 'Stop'
function Start-Process {
  param($FilePath, $ArgumentList, $Verb, [switch]$Wait, [switch]$PassThru)
  if ($Verb -ne 'RunAs' -or -not $Wait -or -not $PassThru) { throw 'Unexpected elevation request' }
  ${invoke}
}
& ${literal(join(scripts, 'Install-Node.ps1'))} -Apply -Json -InstallState missing -SkipNodeProbe
exit $LASTEXITCODE
`);
  let result;
  try {
    result = await execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', entry], {
      env: { ...process.env, TEMP: temp, TMP: temp }, windowsHide: true, timeout: 20000, encoding: 'utf8',
    });
    result.code = 0;
  } catch (error) {
    result = error;
  }
  assert.equal(result.code, outcome === 'ready' ? 0 : 1, 'the child outcome controls the fixture exit');
  assert.ok(result.stdout.trim(), `missing structured result: ${result.stderr}`);
  return JSON.parse(result.stdout.replace(/^\uFEFF/u, '').trim());
}

for (const [name, options] of [
  ['ordinary paths', { scriptFolder: 'scripts', tempFolder: 'temp' }],
  ['the packaged Cats Bot path', { scriptFolder: 'Cats Bot', tempFolder: 'temp' }],
  ['a user temp directory with spaces', { scriptFolder: 'scripts', tempFolder: "Owner's Temp" }],
  ['both paths with spaces', {}],
  ['Unicode and shell punctuation in both paths', { scriptFolder: 'Cats Bot 測試 (A&B)', tempFolder: "Owner's Temp 測試" }],
]) {
  test(`Node elevation preserves its child result with ${name}`, windows, async (t) => {
    const result = await fixture(t, options);
    assert.equal(result.helper, 'windows-node-host-installer');
    assert.equal(result.mode, 'apply');
    assert.equal(result.status, 'failed');
    assert.equal(result.installed, false);
    assert.deepEqual(result.appliedChanges, []);
    assert.deepEqual(result.warnings, [], 'the actual child ran and returned its normal no-install result');
    assert.deepEqual(result.manualSteps, ['Install Node.js LTS manually from https://nodejs.org/.']);
  });
}

for (const code of [0, 7]) {
  test(`a Node elevation child exiting ${code} without a relay is a structured failure`, windows, async (t) => {
    const result = await fixture(t, { outcome: code });
    assert.equal(result.status, 'failed');
    assert.equal(result.installed, false);
    assert.deepEqual(result.appliedChanges, []);
    assert.match(result.warnings.join('\n'), /did not return.*result/iu);
    assert.match(result.warnings.join('\n'), new RegExp(`exit code ${code}`, 'iu'));
    assert.deepEqual(result.interruptions, [], 'a child failure is not a declined UAC prompt');
  });
}

for (const outcome of ['empty', 'invalid', 'no-status', 'locked']) {
  test(`an ${outcome} Node relay cannot report installation success`, windows, async (t) => {
    const result = await fixture(t, { outcome });
    assert.equal(result.status, 'failed');
    assert.equal(result.installed, false);
    assert.deepEqual(result.appliedChanges, []);
    assert.match(result.warnings.join('\n'), /did not return a valid result.*exit code 0/iu);
    assert.deepEqual(result.interruptions, []);
  });
}

test('a valid successful Node relay is returned unchanged', windows, async (t) => {
  assert.deepEqual(await fixture(t, { outcome: 'ready' }), ready);
});

test('a declined Node UAC prompt retains its elevation interruption', windows, async (t) => {
  const result = await fixture(t, { outcome: 'cancel' });
  assert.equal(result.status, 'changes_required');
  assert.equal(result.installed, false);
  assert.deepEqual(result.appliedChanges, []);
  assert.equal(result.interruptions[0].kind, 'elevation_required');
});
