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

const nativeCliPackages = JSON.stringify([
  '@openai/codex',
  '@google/gemini-cli',
  '@github/copilot',
  'opencode-ai',
  '@kilocode/cli',
  '@augmentcode/auggie',
  '@mariozechner/pi-coding-agent',
]);

test('Check-WindowsSetupReadiness reports ready when native CLI pack and WSL substrates are already ready', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
    '-InstalledPackagesJson',
    nativeCliPackages,
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-ClaudeInstallState',
    'installed',
    '-ClaudeAuthState',
    'authenticated',
    '-CursorInstallState',
    'installed',
    '-CursorAuthState',
    'authenticated',
    '-GooseInstallState',
    'installed',
    '-GooseAuthState',
    'authenticated',
    '-JunieInstallState',
    'installed',
    '-JunieAuthState',
    'authenticated',
    '-KiroInstallState',
    'installed',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.helper, 'windows-setup-readiness-audit');
  assert.equal(result.status, 'ready');
  assert.equal(result.nativeCliPack.status, 'ready');
  assert.equal(result.wsl.status, 'ready');
  assert.equal(result.nativeProviders.claude.status, 'ready');
  assert.equal(result.nativeProviders.cursor.status, 'ready');
  assert.equal(result.nativeProviders.goose.status, 'ready');
  assert.equal(result.nativeProviders.junie.status, 'ready');
  assert.equal(result.nativeProviders.kiro.status, 'ready');
  assert.deepEqual(result.plannedActions, []);
});

test('Check-WindowsSetupReadiness reports elevation-required repair actions when native CLI and WSL prerequisites are missing', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-missing-'));
  const desiredPrefix = join(workingDir, '.npm-global');

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    'C:\\Program Files\\nodejs',
    '-CurrentUserPath',
    'C:\\Windows\\System32',
    '-InstalledPackagesJson',
    JSON.stringify(['@openai/codex']),
    '-WindowsBuild',
    '22621',
    '-WslState',
    'missing',
    '-IncludeNativeProviders:$false',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'elevation_required');
  assert.equal(result.plannedActions.includes('repair_native_cli_pack'), true);
  assert.equal(result.plannedActions.includes('wsl:enable_wsl_features'), true);
  assert.equal(result.plannedActions.includes('wsl:install_wsl_kernel'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'elevation_required'), true);
});

test('Check-WindowsSetupReadiness reports auth-required when native providers are installed but not yet signed in', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-auth-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
    '-InstalledPackagesJson',
    nativeCliPackages,
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-ClaudeInstallState',
    'installed',
    '-ClaudeAuthState',
    'authenticated',
    '-CursorInstallState',
    'installed',
    '-CursorAuthState',
    'authenticated',
    '-GooseInstallState',
    'installed',
    '-GooseAuthState',
    'auth_required',
    '-JunieInstallState',
    'installed',
    '-JunieAuthState',
    'authenticated',
    '-KiroInstallState',
    'installed',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'auth_required');
  assert.equal(result.nativeProviders.goose.status, 'auth_required');
  assert.equal(result.plannedActions.includes('provider:authenticate_goose'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'auth_required'), true);
});

test('Check-WindowsSetupReadiness reports install follow-through when Kiro is missing', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-kiro-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
    '-InstalledPackagesJson',
    nativeCliPackages,
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-ClaudeInstallState',
    'installed',
    '-ClaudeAuthState',
    'authenticated',
    '-CursorInstallState',
    'installed',
    '-CursorAuthState',
    'authenticated',
    '-GooseInstallState',
    'installed',
    '-GooseAuthState',
    'authenticated',
    '-JunieInstallState',
    'installed',
    '-JunieAuthState',
    'authenticated',
    '-KiroInstallState',
    'missing',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'not_installed');
  assert.equal(result.nativeProviders.kiro.status, 'not_installed');
  assert.equal(result.plannedActions.includes('provider:install_kiro_native'), true);
});

test('Check-WindowsSetupReadiness reports docker warm-up when Docker Desktop is installed but the engine is not ready', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-docker-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
    '-InstalledPackagesJson',
    nativeCliPackages,
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-ClaudeInstallState',
    'installed',
    '-ClaudeAuthState',
    'authenticated',
    '-CursorInstallState',
    'installed',
    '-CursorAuthState',
    'authenticated',
    '-GooseInstallState',
    'installed',
    '-GooseAuthState',
    'authenticated',
    '-JunieInstallState',
    'installed',
    '-JunieAuthState',
    'authenticated',
    '-KiroInstallState',
    'installed',
    '-IncludeDocker:$true',
    '-DockerState',
    'installed_engine_stopped',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'docker_warm_up_required');
  assert.equal(result.docker.status, 'docker_warm_up_required');
  assert.equal(result.plannedActions.includes('docker:start_docker_desktop'), true);
  assert.equal(result.interruptions.some((entry) => entry.kind === 'docker_warm_up_required'), true);
});

test('Check-WindowsSetupReadiness reports Ollama follow-through when local-model helpers are included', skipUnlessWindows(), async () => {
  const workingDir = await mkdtemp(join(tmpdir(), 'cats-setup-readiness-ollama-'));
  const desiredPrefix = join(workingDir, '.npm-global');
  await mkdir(desiredPrefix, { recursive: true });

  const { stdout } = await execFile('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperPath,
    '-Json',
    '-SkipNodeCheck',
    '-DesiredPrefix',
    desiredPrefix,
    '-CurrentPrefix',
    desiredPrefix,
    '-CurrentUserPath',
    `${desiredPrefix};C:\\Windows\\System32`,
    '-InstalledPackagesJson',
    nativeCliPackages,
    '-WindowsBuild',
    '22621',
    '-WslState',
    'ready',
    '-WslUserBootstrapState',
    'completed',
    '-ClaudeInstallState',
    'installed',
    '-ClaudeAuthState',
    'authenticated',
    '-CursorInstallState',
    'installed',
    '-CursorAuthState',
    'authenticated',
    '-GooseInstallState',
    'installed',
    '-GooseAuthState',
    'authenticated',
    '-JunieInstallState',
    'installed',
    '-JunieAuthState',
    'authenticated',
    '-KiroInstallState',
    'installed',
    '-IncludeLocalModels:$true',
    '-OllamaInstallState',
    'installed',
    '-OllamaApiState',
    'unreachable',
  ]);

  const result = JSON.parse(stdout);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.localModels.ollama.status, 'changes_required');
  assert.equal(result.plannedActions.includes('local_model:start_ollama_local_model'), true);
});
