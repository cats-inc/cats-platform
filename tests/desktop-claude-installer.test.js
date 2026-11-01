import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Install-ClaudeCode.ps1');

async function authFixture(t, { output = '{"loggedIn":true,"authMethod":"claude.ai"}', exitCode = 0, apiKey = '' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cats claude auth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, '.local', 'bin');
  await mkdir(bin, { recursive: true });
  const commandPath = join(bin, 'claude.exe');
  await writeFile(commandPath, 'fixture: never executed');
  for (const name of ['Install-ClaudeCode.ps1', '_HiddenProcess.ps1', '_NativeInstallerSupport.ps1']) {
    await copyFile(join(process.cwd(), 'scripts', 'windows', name), join(root, name));
  }
  const receiptPath = join(root, 'auth-call.json');
  const hiddenProcess = join(root, '_HiddenProcess.ps1');
  await writeFile(hiddenProcess, await readFile(hiddenProcess, 'utf8') + `
function Invoke-HiddenCommand {
  param([string]$FileName, [string[]]$ArgumentList, [int]$TimeoutMs)
  [IO.File]::WriteAllText($env:CATS_TEST_AUTH_RECEIPT, (@{
    command = $FileName; args = $ArgumentList; timeoutMs = $TimeoutMs
  } | ConvertTo-Json -Compress))
  return [pscustomobject]@{
    ExitCode = [int]$env:CATS_TEST_AUTH_EXIT
    Output = $env:CATS_TEST_AUTH_OUTPUT
    ErrorOutput = 'private fixture diagnostic'
  }
}
`);
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    join(root, 'Install-ClaudeCode.ps1'), '-CheckOnly', '-Json', '-InstallState', 'installed',
    '-NpmShimState', 'missing', '-DetectedVersion', 'claude fixture', '-SkipInstaller'];
  const result = await execFile('powershell.exe', args, { env: {
    ...process.env, USERPROFILE: root, ANTHROPIC_API_KEY: apiKey,
    CATS_TEST_AUTH_RECEIPT: receiptPath, CATS_TEST_AUTH_OUTPUT: output, CATS_TEST_AUTH_EXIT: String(exitCode),
  } });
  return { ...result, state: JSON.parse(result.stdout), receiptPath, commandPath };
}

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

test('Install-ClaudeCode reports ready in check mode when Claude Code is already installed', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'authenticated',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-claude-native-installer');
  assert.equal(result.mode, 'check');
  assert.equal(result.status, 'ready');
  assert.equal(result.installed, true);
  assert.equal(result.detectedVersion, 'claude 1.2.3');
  assert.deepEqual(result.plannedActions, []);
});

test('Install-ClaudeCode reports auth-required in check mode when Claude Code is installed but not authenticated yet', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'auth_required',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'auth_required');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
});

test('Install-ClaudeCode recognizes browser/subscription login without an API key using a bounded status probe', skipUnlessWindows(), async t => {
  const f = await authFixture(t, { output: '{"loggedIn":true,"authMethod":"claude.ai","privateFixture":"must-not-escape"}' });
  assert.equal(f.state.status, 'ready');
  assert.deepEqual(f.state.manualSteps, []);
  assert.deepEqual(f.state.interruptions, []);
  const receipt = JSON.parse(await readFile(f.receiptPath, 'utf8'));
  assert.equal(receipt.command, f.commandPath);
  assert.deepEqual(receipt.args, ['auth', 'status', '--json']);
  assert.equal(receipt.timeoutMs, 10000);
  assert.doesNotMatch(f.stdout + f.stderr, /must-not-escape|private fixture diagnostic/u);
});

test('Install-ClaudeCode does not treat logged-out, malformed, string-valued or failed probes as authenticated', skipUnlessWindows(), async t => {
  for (const probe of [
    { output: '{"loggedIn":false}' },
    { output: '{"loggedIn":"false"}' },
    { output: '{"loggedIn":"true"}' },
    { output: '{}' },
    { output: 'not JSON' },
    { output: '{"loggedIn":true}', exitCode: 1 },
  ]) {
    const f = await authFixture(t, probe);
    assert.equal(f.state.status, 'auth_required', JSON.stringify(probe));
    assert.ok(f.state.interruptions.some(item => item.kind === 'auth_required'));
  }
});

test('Install-ClaudeCode retains API-key readiness without requiring the OAuth probe', skipUnlessWindows(), async t => {
  const f = await authFixture(t, { apiKey: 'fixture-key', output: 'should not run' });
  assert.equal(f.state.status, 'ready');
  await assert.rejects(readFile(f.receiptPath), { code: 'ENOENT' });
});

test('Install-ClaudeCode reports shim cleanup and install recovery when the native installer baseline is not yet clean', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'present',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.plannedActions.includes('remove_legacy_npm_claude_shim'), true);
  assert.equal(result.plannedActions.includes('install_claude_code_native'), true);
});

test('Install-ClaudeCode retains recovery guidance without claiming a skipped reinstall', skipUnlessWindows(), async () => {
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
    '-NpmShimState',
    'missing',
    '-AuthState',
    'auth_required',
    '-SkipInstaller',
    '-DetectedVersion',
    'claude 1.2.3',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'relaunch_required');
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.appliedChanges, []);
  assert.equal(result.observedChange, 'unchanged');
  assert.equal(result.interruptions.some((entry) => entry.kind === 'relaunch_required'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
  assert.equal(result.manualSteps.some((step) => step.includes('ANTHROPIC_API_KEY')), true);
});

// Writing the user PATH touches the real registry, so only the wiring is checked here.
test('Install-ClaudeCode puts the native install folder on the user PATH, never under -SkipInstaller', async () => {
  const script = await readFile(helperPath, 'utf8');
  assert.match(script, /function Add-ClaudeToUserPath \{[\s\S]*?SetEnvironmentVariable\('Path', "\$installDir;\$userPath", 'User'\)/u);
  assert.match(
    script,
    /if \(\$detected\.installed -and -not \$SkipInstaller -and \(Test-Path -LiteralPath \(Resolve-ClaudeExecutablePath\)\)\) \{\s*Add-ClaudeToUserPath\s*\}/u,
  );
});
