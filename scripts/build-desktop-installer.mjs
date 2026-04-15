#!/usr/bin/env node

import process from 'node:process';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '..', 'cats-runtime');

function printHelp() {
  process.stdout.write(`Usage: node scripts/build-desktop-installer.mjs [options]

Options:
  --target <current|windows|macos|linux>  Installer target. Defaults to current.
  --arch <x64|arm64|universal>            Override the configured target architectures.
  --format <nsis|dmg|pkg|zip|AppImage|deb|tar.gz>
                                         Override the configured installer formats.
  --sidecar-layout <split|bundle>         Choose loose-file or bundled sidecars for both app/runtime.
  --help                                  Show this help text.

Without --arch/--format, the electron-builder target matrix from package.json is preserved.
`);
}

function resolveSidecarLayout(value) {
  if (value === undefined || value === null || value === '') {
    return 'split';
  }
  if (value === 'split' || value === 'bundle') {
    return value;
  }
  throw new Error(`Unsupported sidecar layout: ${value}`);
}

export function parseArgs(argv, env = process.env) {
  let target = 'current';
  let arch = null;
  let format = null;
  let sidecarLayout = resolveSidecarLayout(env.CATS_DESKTOP_SIDECAR_LAYOUT);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, target, arch, format, sidecarLayout };
    }
    if (value === '--target') {
      target = argv[index + 1] ?? 'current';
      index += 1;
      continue;
    }
    if (value === '--arch') {
      arch = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === '--format') {
      format = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === '--sidecar-layout') {
      sidecarLayout = resolveSidecarLayout(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, target, arch, format, sidecarLayout };
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

export function buildInstallerEnvironment(baseEnv = process.env) {
  const env = {
    ...baseEnv,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  };

  for (const key of ['WIN_CSC_LINK', 'CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD']) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim() === '') {
      delete env[key];
    }
  }

  return env;
}

async function runCommand(command, args, cwd, envOverrides = {}) {
  const invocation = await resolveCommandInvocation(command, args);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env: buildInstallerEnvironment({
        ...process.env,
        ...envOverrides,
      }),
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

const PLATFORM_FORMATS = {
  windows: ['nsis'],
  macos: ['dmg', 'pkg', 'zip'],
  linux: ['AppImage', 'deb', 'tar.gz'],
};

const VALID_ARCHES = {
  windows: ['x64', 'arm64'],
  macos: ['x64', 'arm64', 'universal'],
  linux: ['x64', 'arm64'],
};

function normalizeFormat(target, formatOverride) {
  if (formatOverride === null) {
    return null;
  }

  const canonicalFormat = PLATFORM_FORMATS[target].find(
    (candidate) => candidate.toLowerCase() === formatOverride.toLowerCase(),
  );

  if (!canonicalFormat) {
    throw new Error(
      `Unsupported format '${formatOverride}' for ${target}. Valid: ${PLATFORM_FORMATS[target].join(', ')}`,
    );
  }

  return canonicalFormat;
}

function electronBuilderArgs(target, archOverride, formatOverride) {
  if (archOverride !== null && !VALID_ARCHES[target].includes(archOverride)) {
    throw new Error(
      `Unsupported arch '${archOverride}' for ${target}. Valid: ${VALID_ARCHES[target].join(', ')}`,
    );
  }

  const format = normalizeFormat(target, formatOverride);
  const platformFlag = target === 'windows' ? '--win' : target === 'macos' ? '--mac' : '--linux';
  const args = ['electron-builder', platformFlag];

  if (format !== null) {
    args.push(format);
  } else if (archOverride !== null) {
    args.push(...PLATFORM_FORMATS[target], `--${archOverride}`);
  }

  if (format !== null && archOverride !== null) {
    args.push(`--${archOverride}`);
  }

  args.push('--publish', 'never');
  return args;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const resolvedTarget = resolveBuilderTarget(parsed.target);
  const sidecarBuildEnv = {
    CATS_DESKTOP_SIDECAR_LAYOUT: parsed.sidecarLayout,
  };
  await runCommand('npm', ['run', 'build'], RUNTIME_ROOT, sidecarBuildEnv);
  await runCommand('npm', ['run', 'build'], PROJECT_ROOT, sidecarBuildEnv);
  await runCommand(
    'node',
    [
      'scripts/package-desktop.mjs',
      '--platform',
      resolvedTarget,
      '--sidecar-layout',
      parsed.sidecarLayout,
    ],
    PROJECT_ROOT,
    sidecarBuildEnv,
  );
  await runCommand('npx', electronBuilderArgs(resolvedTarget, parsed.arch, parsed.format), PROJECT_ROOT);
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
