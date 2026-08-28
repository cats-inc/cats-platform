import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join } from 'node:path';
import test from 'node:test';

const execFile = promisify(execFileCallback);
const helperPath = join(process.cwd(), 'scripts', 'windows', 'Check-WindowsSetupReadiness.ps1');

function skipUnlessWindows() {
  if (process.platform !== 'win32') {
    return { skip: 'Windows-only packaged setup helper' };
  }
  return {};
}

async function runAudit(extraArgs = []) {
  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    ...extraArgs,
  ]);
  return JSON.parse(stdout);
}

test('Check-WindowsSetupReadiness reports ready when the prerequisite substrate is already ready', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', desiredPrefix,
    '-CurrentUserPath', `${desiredPrefix};C:\\Windows\\System32`,
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'installed',
  ]);

  assert.equal(result.helper, 'windows-setup-readiness-audit');
  assert.equal(result.collectionMode, 'parallel');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.plannedActions, []);
});

/**
 * The audit's contract, not an implementation detail: provider presence belongs
 * to cats-runtime's setup scan, which probes each CLI once and reports a
 * version and a probe-backed auth status. Auditing them here as well meant one
 * spawned powershell.exe per provider for answers the host never read.
 */
test('Check-WindowsSetupReadiness audits prerequisites only, never provider CLIs', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-scope-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', desiredPrefix,
    '-CurrentUserPath', `${desiredPrefix};C:\\Windows\\System32`,
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'installed',
  ]);

  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'collectionMode',
      'githubCli',
      'helper',
      'interruptions',
      'localModels',
      'nodeHost',
      'plannedActions',
      'prefixHelper',
      'status',
      'warnings',
    ],
    'a provider or npm-pack section here means the audit spawned helpers for them again',
  );
  assert.equal(
    result.plannedActions.some((action) => action.startsWith('provider:')),
    false,
  );
  assert.equal(
    result.plannedActions.includes('repair_native_cli_pack'),
    false,
    'the npm-global CLI pack is inventory territory now',
  );
  // Without -IncludeLocalModels only the three prerequisite helpers run.
  assert.equal(result.localModels.ollama, null);
});

test('Check-WindowsSetupReadiness reports repair actions when the npm prefix is misconfigured but Node host is installed', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-missing-'));
  const desiredPrefix = join(workingDir, '.npm-global');

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', 'C:\\Program Files\\nodejs',
    '-CurrentUserPath', 'C:\\Windows\\System32',
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'installed',
  ]);

  assert.equal(result.plannedActions.includes('repair_npm_prefix'), true);
  assert.equal(result.plannedActions.includes('install_node_lts'), false);
});

test('Check-WindowsSetupReadiness routes the user to the Node host installer when Node.js is missing', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-no-node-'));
  const desiredPrefix = join(workingDir, '.npm-global');

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', '',
    '-CurrentUserPath', 'C:\\Windows\\System32',
    '-NodeHostInstallState', 'missing',
    '-GitHubCliInstallState', 'installed',
  ]);

  assert.equal(result.nodeHost.status, 'changes_required');
  assert.equal(result.plannedActions.includes('install_node_lts'), true);
  // Node itself is missing, so the prefix helper cannot run yet — do not stack
  // a second repair signal on top of the one that has to happen first.
  assert.equal(result.plannedActions.includes('repair_npm_prefix'), false);
});

test('Check-WindowsSetupReadiness routes the user to the GitHub CLI installer when gh is missing', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-no-gh-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', desiredPrefix,
    '-CurrentUserPath', `${desiredPrefix};C:\\Windows\\System32`,
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'missing',
  ]);

  assert.equal(result.plannedActions.includes('install_github_cli'), true);
});

test('Check-WindowsSetupReadiness reports Ollama follow-through when local-model helpers are included', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-ollama-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const result = await runAudit([
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', desiredPrefix,
    '-CurrentUserPath', `${desiredPrefix};C:\\Windows\\System32`,
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'installed',
    '-IncludeLocalModels:$true',
    '-OllamaInstallState', 'installed',
    '-OllamaApiState', 'unreachable',
  ]);

  assert.equal(result.status, 'changes_required');
  assert.equal(result.localModels.ollama.status, 'changes_required');
  assert.equal(result.plannedActions.includes('local_model:start_ollama_local_model'), true);
});

test('Check-WindowsSetupReadiness can force serial collection for deterministic debugging', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-serial-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const result = await runAudit([
    '-Parallel:$false',
    '-DesiredPrefix', desiredPrefix,
    '-CurrentPrefix', desiredPrefix,
    '-CurrentUserPath', `${desiredPrefix};C:\\Windows\\System32`,
    '-NodeHostInstallState', 'installed',
    '-GitHubCliInstallState', 'installed',
  ]);

  assert.equal(result.collectionMode, 'serial');
  assert.equal(result.status, 'ready');
});
