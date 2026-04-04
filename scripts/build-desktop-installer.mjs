#!/usr/bin/env node

import process from 'node:process';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '..', 'cats-runtime');

function printHelp() {
  process.stdout.write(`Usage: node scripts/build-desktop-installer.mjs [options]

Options:
  --target <current|windows|macos|linux>  Installer target. Defaults to current.
  --help                      Show this help text.
`);
}

function parseArgs(argv) {
  let target = 'current';

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, target };
    }
    if (value === '--target') {
      target = argv[index + 1] ?? 'current';
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, target };
}

async function resolveNodeCliScript(command) {
  const scriptName = command === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const candidates = [];

  if (command === 'npm' && process.env.npm_execpath?.trim()) {
    candidates.push(resolve(process.env.npm_execpath.trim()));
  }

  const nodeDir = dirname(process.execPath);
  candidates.push(resolve(nodeDir, 'node_modules', 'npm', 'bin', scriptName));
  candidates.push(resolve(nodeDir, '..', 'node_modules', 'npm', 'bin', scriptName));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function resolveCommandInvocation(command, args) {
  if (command === 'npm' || command === 'npx') {
    const cliScript = await resolveNodeCliScript(command);
    if (cliScript) {
      return {
        command: process.execPath,
        args: [cliScript, ...args],
      };
    }
  }

  return {
    command,
    args,
  };
}

async function runCommand(command, args, cwd) {
  const invocation = await resolveCommandInvocation(command, args);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(
        `${invocation.command} ${invocation.args.join(' ')} exited with code ${code ?? 'null'}`,
      ));
    });
    child.once('error', reject);
  });
}

function resolveBuilderTarget(target) {
  if (target === 'current') {
    switch (process.platform) {
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      case 'linux':
        return 'linux';
      default:
        throw new Error('Current-platform installer builds are only wired for Windows, macOS, and Linux.');
    }
  }
  if (target === 'windows') {
    return 'windows';
  }
  if (target === 'macos') {
    return 'macos';
  }
  if (target === 'linux') {
    return 'linux';
  }
  throw new Error(`Unsupported installer target: ${target}`);
}

function electronBuilderArgs(target) {
  switch (target) {
    case 'windows':
      return ['electron-builder', '--win', 'nsis', '--x64', '--publish', 'never'];
    case 'macos':
      return ['electron-builder', '--mac', '--publish', 'never'];
    case 'linux':
      return ['electron-builder', '--linux', '--publish', 'never'];
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const resolvedTarget = resolveBuilderTarget(parsed.target);
  await runCommand('npm', ['run', 'build'], RUNTIME_ROOT);
  await runCommand('npm', ['run', 'build'], PROJECT_ROOT);
  await runCommand('node', ['scripts/package-desktop.mjs', '--platform', resolvedTarget], PROJECT_ROOT);
  await runCommand('npx', electronBuilderArgs(resolvedTarget), PROJECT_ROOT);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
