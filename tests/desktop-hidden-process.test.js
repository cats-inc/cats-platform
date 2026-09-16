import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const scriptsRoot = join(process.cwd(), 'scripts', 'windows');
const hiddenProcessPath = join(scriptsRoot, '_HiddenProcess.ps1');
const providerScripts = [
  'Install-ClaudeCode.ps1',
  'Install-CursorAgent.ps1',
  'Install-Goose.ps1',
  'Install-Junie.ps1',
  'Install-Ollama.ps1',
];

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only hidden process helper' };
  }
  return {};
}

function escapePowerShellSingleQuoted(value) {
  return value.replaceAll("'", "''");
}

test('provider installers use metadata or hidden processes for version detection', async () => {
  for (const scriptName of providerScripts) {
    const scriptPath = join(scriptsRoot, scriptName);
    const script = await readFile(scriptPath, 'utf8');
    assert.match(script, /_HiddenProcess\.ps1/);
    assert.match(script, /Resolve-HiddenVersionProbePath/);
    if (scriptName === 'Install-Ollama.ps1') {
      assert.match(script, /FileVersionInfo\]::GetVersionInfo/);
      assert.doesNotMatch(script, /Get-HiddenCommandText/);
    } else {
      assert.match(script, /Get-HiddenCommandText/);
    }
    assert.doesNotMatch(script, /& (claude|cursor-agent|goose|junie|ollama) --version/);
    assert.doesNotMatch(script, /& \$[A-Za-z]+ExecutablePath --version/);
  }
});

test('Invoke-HiddenCommand preserves stdout, stderr, and exit code', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-hidden-process-'));
  const runnerPath = join(workingDir, 'invoke-hidden.ps1');
  await writeFile(runnerPath, [
    "Set-StrictMode -Version Latest",
    "$ErrorActionPreference = 'Stop'",
    `. '${escapePowerShellSingleQuoted(hiddenProcessPath)}'`,
    "$result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList @(",
    "  '-NoProfile',",
    "  '-Command',",
    "  \"Write-Output 'fake-cli 1.2.3'; [Console]::Error.WriteLine('fake warning'); exit 7\"",
    ')',
    '[pscustomobject]@{',
    '  exitCode = $result.ExitCode',
    '  output = $result.Output.Trim()',
    '  errorOutput = $result.ErrorOutput.Trim()',
    '} | ConvertTo-Json -Compress',
    '',
  ].join('\n'));

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runnerPath,
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.exitCode, 7);
  assert.equal(result.output, 'fake-cli 1.2.3');
  assert.equal(result.errorOutput, 'fake warning');
});

test('hidden command timeout terminates its owned descendant process', skipUnlessWindows(), async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cats-hidden-timeout-'));
  const child = join(dir, 'child.ps1');
  const parent = join(dir, 'parent.ps1');
  const pidFile = join(dir, 'child.pid');
  const runner = join(dir, 'runner.ps1');
  const literal = (s) => `'${escapePowerShellSingleQuoted(s)}'`;
  await writeFile(child, 'Start-Sleep -Seconds 45');
  await writeFile(parent, `$p = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-File',${literal(child)})\n$p.Id | Set-Content -LiteralPath ${literal(pidFile)}\nStart-Sleep -Seconds 45`);
  await writeFile(runner, `. ${literal(hiddenProcessPath)}
$result = Invoke-HiddenCommand -FileName powershell.exe -ArgumentList @('-NoProfile', '-File', ${literal(parent)}) -TimeoutMs 5000
$childId = [int](Get-Content -LiteralPath ${literal(pidFile)})
$remaining = Get-Process -Id $childId -ErrorAction SilentlyContinue
if ($remaining) { Stop-Process -Id $childId -Force }
@{ timedOut = $result.ExitCode -eq -1; childAlive = $null -ne $remaining } | ConvertTo-Json`);
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner], { timeout: 20000 });
  assert.deepEqual(JSON.parse(stdout), { timedOut: true, childAlive: false });
});
