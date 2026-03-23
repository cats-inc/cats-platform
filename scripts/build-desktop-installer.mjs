#!/usr/bin/env node

import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '..', 'cats-runtime');

function printHelp() {
  process.stdout.write(`Usage: node scripts/build-desktop-installer.mjs [options]

Options:
  --target <current|windows>  Installer target. Defaults to current.
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

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'null'}`));
    });
    child.once('error', reject);
  });
}

function resolveBuilderTarget(target) {
  if (target === 'current') {
    if (process.platform === 'win32') {
      return 'windows';
    }
    throw new Error('Current-platform installer builds are only wired for Windows in this slice.');
  }
  if (target === 'windows') {
    return 'windows';
  }
  throw new Error(`Unsupported installer target: ${target}`);
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

  if (resolvedTarget === 'windows') {
    await runCommand('npx', [
      'electron-builder',
      '--win',
      'nsis',
      '--x64',
      '--publish',
      'never',
    ], PROJECT_ROOT);
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
