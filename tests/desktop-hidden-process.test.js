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

test('provider installer version probes use the hidden process helper', async () => {
  for (const scriptName of providerScripts) {
    const scriptPath = join(scriptsRoot, scriptName);
    const script = await readFile(scriptPath, 'utf8');
    assert.match(script, /_HiddenProcess\.ps1/);
    assert.match(script, /Resolve-HiddenVersionProbePath/);
    assert.match(script, /Get-HiddenCommandText/);
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
