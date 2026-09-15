import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-Ollama.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Ollama detection reads file metadata without executing the installed command', skipUnlessWindows(), async () => {
  const script = `
    $ErrorActionPreference = 'Stop'
    $InstallState = 'auto'
    $DetectedVersion = ''
    $script:executed = $false
    function Resolve-OllamaExecutablePath { $env:CATS_TEST_EXECUTABLE }
    function Resolve-OllamaAppPath { 'fixture-app' }
    function Refresh-UserPath {}
    function Get-Command { [pscustomobject]@{ Source = $env:CATS_TEST_EXECUTABLE } }
    function Resolve-HiddenVersionProbePath { param($PreferredPath, $FallbackPath) $PreferredPath }
    function Get-HiddenCommandText { $script:executed = $true; throw 'Provider execution is forbidden' }
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($env:CATS_TEST_HELPER, [ref]$null, [ref]$null)
    $detector = $ast.Find({ param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Detect-OllamaInstall'
    }, $true)
    Invoke-Expression $detector.Extent.Text
    $result = Detect-OllamaInstall
    [pscustomobject]@{
      detected = $result
      executed = $script:executed
      expectedVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($env:CATS_TEST_EXECUTABLE).ProductVersion
    } | ConvertTo-Json -Depth 4
  `;
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    env: { ...process.env, CATS_TEST_HELPER: helperPath, CATS_TEST_EXECUTABLE: process.execPath },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.executed, false);
  assert.equal(result.detected.installed, true);
  assert.ok(result.expectedVersion);
  assert.equal(result.detected.detectedVersion, result.expectedVersion);
});

test('Install-Ollama reports ready in check mode when Ollama is installed and its API is reachable', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-ApiState',
    'reachable',
    '-DetectedVersion',
    'ollama version 0.6.5',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-ollama-local-model-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.apiReady, true);
  assert.equal(result.detectedVersion, 'ollama version 0.6.5');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-Ollama reports manual follow-through in check mode when Ollama is installed but the API is not ready', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'installed',
    '-ApiState',
    'unreachable',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.plannedActions.includes('start_ollama_local_model'), true);
  assert.equal(result.manualSteps.length >= 1, true);
});

test('Install-Ollama reports install action in check mode when Ollama is missing', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-CheckOnly',
    '-Json',
    '-InstallState',
    'missing',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.installed, false);
  assert.equal(result.plannedActions.includes('install_ollama_local_model'), true);
});

test('Install-Ollama records follow-through after a forced reinstall when the API is still warming up', skipUnlessWindows(), async () => {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Force',
    '-Json',
    '-InstallState',
    'installed',
    '-ApiState',
    'unreachable',
    '-SkipInstaller',
    '-DetectedVersion',
    'ollama version 0.6.5',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.appliedChanges.includes('reinstall_ollama_local_model'), true);
  assert.equal(result.manualSteps.length >= 1, true);
});
