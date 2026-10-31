import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

// The Git prerequisite helpers run in check mode only here: fixtures replace git,
// package managers, Homebrew and xcode-select, so no test reads or writes the
// host's git installation or configuration.
const execFile = promisify(callback);
const windows = { skip: process.platform !== 'win32' };
const IDENTITY_STEP = 'Set your commit identity: git config --global user.name "Your Name" and git config --global user.email "you@example.com".';
const HOMEBREW_STEP = 'Install Homebrew from https://brew.sh, then set up Git.';

const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const windowsHelper = literal(join(process.cwd(), 'scripts/windows/Install-Git.ps1'));
async function runPowerShell(source) {
  const dir = await mkdtemp(join(tmpdir(), 'cats-git-helper-'));
  try {
    const file = join(dir, 'fixture.ps1');
    await writeFile(file, `Set-StrictMode -Version Latest\n$ErrorActionPreference = 'Stop'\n${source}`);
    const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file], { timeout: 25000 });
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Windows Git check asks for a commit identity without blocking readiness', windows, async () => {
  const result = await runPowerShell(`
function Get-Command { param($Name) if ($Name -eq 'git') { [pscustomobject]@{ Source = 'fixture-git.exe' } } }
function git {
 if ($args[0] -eq '--version') { return 'git version 2.47.1.windows.2' }
 if ($args[0] -eq 'config' -and $args[3] -eq 'user.name') { return 'Fixture User' }
}
& ${windowsHelper} -CheckOnly -Json`);
  assert.equal(result.helper, 'windows-git-installer');
  assert.equal(result.displayName, 'Git for Windows');
  assert.equal(result.status, 'ready');
  assert.equal(result.detectedVersion, '2.47.1');
  assert.deepEqual(result.plannedActions, []);
  assert.deepEqual(result.manualSteps, [IDENTITY_STEP]);
});

test('Windows Git check plans the install when git is missing', windows, async () => {
  const result = await runPowerShell(`
function Get-Command { param($Name) }
function git { throw 'A missing git ran' }
& ${windowsHelper} -CheckOnly -Json`);
  assert.equal(result.status, 'changes_required');
  assert.equal(result.installed, false);
  assert.equal(result.detectedVersion, '');
  assert.deepEqual(result.plannedActions, ['install_git']);
  assert.deepEqual(result.manualSteps, []);
});

// The readiness audit passes -SkipGitProbe under -SkipNodeCheck; its answer must
// not depend on the git or the global identity of the machine running it.
test('Windows Git check with -SkipGitProbe never looks up or runs git', windows, async () => {
  const result = await runPowerShell(`
$global:gitProbes = @()
function Get-Command { param($Name) if ($Name -eq 'git') { $global:gitProbes += 'lookup' } }
function git { $global:gitProbes += 'run' }
& ${windowsHelper} -CheckOnly -Json -SkipGitProbe -InstallState installed
if ($global:gitProbes.Count -gt 0) { throw "git was probed: $($global:gitProbes -join ', ')" }`);
  assert.equal(result.status, 'ready');
  assert.equal(result.commandPath, '');
  assert.deepEqual(result.manualSteps, []);
});

// Asset selection runs only on the install path, so the test loads the two
// functions from the script instead of running a mutation mode.
test('Windows Git installer download follows the OS architecture', windows, async () => {
  const result = await runPowerShell(`
$ast = [System.Management.Automation.Language.Parser]::ParseFile(${windowsHelper}, [ref]$null, [ref]$null)
foreach ($name in @('Select-GitInstallerAsset', 'Get-WindowsArchitecture')) {
 $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
 . ([scriptblock]::Create($definition.Extent.Text))
}
$assets = @('PortableGit-2.47.1.2-64-bit.7z.exe', 'MinGit-2.47.1.2-64-bit.zip', 'Git-2.47.1.2-32-bit.exe',
 'Git-2.47.1.2-64-bit.tar.bz2', 'Git-2.47.1.2-arm64.exe', 'Git-2.47.1.2-64-bit.exe') |
 ForEach-Object { [pscustomobject]@{ name = $_ } }
$env:PROCESSOR_ARCHITECTURE = 'AMD64'
$env:PROCESSOR_ARCHITEW6432 = 'ARM64'
$arm = Get-WindowsArchitecture
$env:PROCESSOR_ARCHITEW6432 = $null
$x64 = Get-WindowsArchitecture
[pscustomobject]@{
 arm = $arm
 x64 = $x64
 armAsset = (Select-GitInstallerAsset -Assets $assets -Architecture $arm).name
 x64Asset = (Select-GitInstallerAsset -Assets $assets -Architecture $x64).name
 candidate = [bool](Select-GitInstallerAsset -Assets @([pscustomobject]@{ name = 'Git-2.48.0-rc1-64-bit.exe' }) -Architecture 'AMD64')
} | ConvertTo-Json`);
  assert.deepEqual(result, {
    arm: 'ARM64', x64: 'AMD64', armAsset: 'Git-2.47.1.2-arm64.exe', x64Asset: 'Git-2.47.1.2-64-bit.exe', candidate: false,
  });
});

const bashExecutable = process.platform === 'win32'
  ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'bash.exe')
  : 'bash';
const toBashPath = (value) => {
  const normalized = value.replace(/\\/gu, '/');
  return process.platform === 'win32'
    ? normalized.replace(/^([A-Za-z]):\//u, (_match, drive) => `/mnt/${drive.toLowerCase()}/`)
    : normalized;
};
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const recordCall = ': > "$0.called"; exit 1';
const fakeGit = (identity) => `case "$1" in
 --version) echo 'git version 2.47.1 (Homebrew)' ;;
 config) ${identity === 'complete' ? "echo 'Fixture'" : "[ \"$4\" = user.name ] && echo 'Fixture User'"}; exit 0 ;;
esac`;

// The helper sees only the stub directory (plus extraPath) on PATH, so the
// host's own git, package managers and Homebrew cannot change its answer. A
// stub that records a call fails the run if the helper executed it.
async function runUnixHelper(platform, { stubs = {}, extraPath = '', args = [] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cats-git-helper-'));
  try {
    const lines = ['#!/usr/bin/env bash', 'set -euo pipefail', `bin=${quote(toBashPath(join(dir, 'bin')))}`, 'mkdir -p "$bin"'];
    for (const [name, body] of Object.entries(stubs)) {
      lines.push(`cat > "$bin/${name}" <<'STUB'\n#!/bin/sh\n${body}\nSTUB`, `chmod +x "$bin/${name}"`);
    }
    const helper = quote(toBashPath(join(process.cwd(), 'scripts', platform, 'install-git.sh')));
    lines.push(`PATH="$bin${extraPath ? `:${extraPath}` : ''}" /bin/bash ${helper} --check --json ${args.join(' ')}`);
    lines.push('shopt -s nullglob', 'called=("$bin"/*.called)',
      'if [ ${#called[@]} -gt 0 ]; then printf "unexpected call: %s\\n" "${called[@]}" >&2; exit 97; fi');
    const script = join(dir, 'fixture.sh');
    await writeFile(script, `${lines.join('\n')}\n`);
    const { stdout } = await execFile(bashExecutable, [toBashPath(script)], { timeout: 30000 });
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Linux Git check names the detected package manager and never runs sudo', async () => {
  for (const [managers, step] of [
    [['apt-get', 'dnf', 'yum'], 'Install Git in a terminal with: sudo apt-get install git'],
    [['dnf', 'yum'], 'Install Git in a terminal with: sudo dnf install git'],
    [['yum'], 'Install Git in a terminal with: sudo yum install git'],
    [[], 'Install Git with your distribution package manager (https://git-scm.com/download/linux).'],
  ]) {
    const stubs = Object.fromEntries([...managers.map((name) => [name, recordCall]), ['sudo', recordCall]]);
    const result = await runUnixHelper('linux', { stubs });
    assert.equal(result.helper, 'linux-git-installer');
    assert.equal(result.status, 'changes_required');
    assert.equal(result.installed, false);
    assert.deepEqual(result.plannedActions, ['install_git']);
    assert.deepEqual(result.appliedChanges, []);
    assert.deepEqual(result.manualSteps, [step]);
  }
});

test('Linux Git check reports a missing commit identity and stays ready', async () => {
  const partial = await runUnixHelper('linux', { stubs: { git: fakeGit('name-only') } });
  assert.equal(partial.status, 'ready');
  assert.equal(partial.detectedVersion, '2.47.1');
  assert.match(partial.commandPath, /\/bin\/git$/u);
  assert.deepEqual(partial.manualSteps, [IDENTITY_STEP]);
  const complete = await runUnixHelper('linux', { stubs: { git: fakeGit('complete') } });
  assert.equal(complete.status, 'ready');
  assert.deepEqual(complete.manualSteps, []);
});

test('macOS Git check never counts the /usr/bin/git stub without Command Line Tools', async () => {
  const result = await runUnixHelper('macos', { stubs: { 'xcode-select': 'exit 2' }, extraPath: '/usr/bin' });
  assert.notEqual(result.commandPath, '/usr/bin/git');
  assert.equal(result.installed, result.commandPath !== '');
});

test('macOS Git check counts a Homebrew git and asks for Homebrew only when it is missing', async () => {
  const homebrewGit = await runUnixHelper('macos', { stubs: { 'xcode-select': 'exit 2', git: fakeGit('name-only') } });
  assert.equal(homebrewGit.helper, 'macos-git-installer');
  assert.equal(homebrewGit.status, 'ready');
  assert.equal(homebrewGit.detectedVersion, '2.47.1');
  assert.deepEqual(homebrewGit.manualSteps, [IDENTITY_STEP]);
  const noHomebrew = await runUnixHelper('macos', { args: ['--install-state', 'missing'] });
  assert.equal(noHomebrew.status, 'changes_required');
  assert.deepEqual(noHomebrew.plannedActions, ['install_git']);
  assert.deepEqual(noHomebrew.manualSteps, [HOMEBREW_STEP]);
  const withHomebrew = await runUnixHelper('macos', { stubs: { brew: recordCall }, args: ['--install-state', 'missing'] });
  assert.equal(withHomebrew.status, 'changes_required');
  assert.deepEqual(withHomebrew.manualSteps, []);
});
