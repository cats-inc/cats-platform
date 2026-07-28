#!/usr/bin/env node

import process from 'node:process';
import { access, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { parseStableReleaseTag } from './validate-release-version.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const RUNTIME_ROOT = resolve(PROJECT_ROOT, '..', 'cats-runtime');
const NATIVE_BUILD_ROOT = resolve(PROJECT_ROOT, 'build', 'native');
const MOBILE_BUILD_ROOT = resolve(PROJECT_ROOT, 'build', 'mobile');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(resolve(PROJECT_ROOT, '.env'));
  } catch {
    // .env is optional; ignore when missing or unreadable.
  }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/build-desktop-installer.mjs [options]

Options:
  --target <current|windows|macos|linux>  Installer target. Defaults to current.
  --arch <x64|arm64|universal>            Override the configured target architectures.
  --format <nsis|dmg|pkg|zip|AppImage|deb|tar.gz>
                                         Override the configured installer formats.
  --sidecar-layout <split|bundle>         Choose loose-file or bundled sidecars for both app/runtime.
  --skip-mobile                           Skip the mobile bundle (\`expo export\`). Also honored via
                                          CATS_SKIP_MOBILE=1 in the environment or .env.
  --release                               Build in release mode: publish to the configured GitHub
                                          provider and allow signing identity discovery. Requires a
                                          stable vX.Y.Z tag and a GitHub token. Also honored via
                                          CATS_DESKTOP_RELEASE_MODE=1.
  --help                                  Show this help text.

Without --arch/--format, the electron-builder target matrix from package.json is preserved.

Local packaging never publishes and never discovers signing identities. Release mode is intended
for the tag-gated desktop release workflow only.
`);
}

function parseBooleanFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
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
  let skipMobile = parseBooleanFlag(env.CATS_SKIP_MOBILE);
  let releaseMode = parseBooleanFlag(env.CATS_DESKTOP_RELEASE_MODE);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, target, arch, format, sidecarLayout, skipMobile, releaseMode };
    }
    if (value === '--release') {
      releaseMode = true;
      continue;
    }
    if (value === '--no-release') {
      releaseMode = false;
      continue;
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
    if (value === '--skip-mobile') {
      skipMobile = true;
      continue;
    }
    if (value === '--no-skip-mobile') {
      skipMobile = false;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, target, arch, format, sidecarLayout, skipMobile, releaseMode };
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

const SIGNING_CREDENTIAL_KEYS = [
  'WIN_CSC_LINK',
  'CSC_LINK',
  'WIN_CSC_KEY_PASSWORD',
  'CSC_KEY_PASSWORD',
];

/**
 * Local and test packaging must never reach for a signing identity, because an
 * unconfigured machine would otherwise pick up an unrelated certificate from
 * the OS keychain. Release mode leaves identity discovery to the workflow so a
 * configured certificate can actually be used.
 *
 * Empty credential variables are dropped in both modes: electron-builder treats
 * an empty CSC_LINK as a relative path and resolves it against the project
 * root.
 */
export function buildInstallerEnvironment(baseEnv = process.env, options = {}) {
  const releaseMode = options.releaseMode === true;
  const env = { ...baseEnv };

  if (!releaseMode) {
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  }

  for (const key of SIGNING_CREDENTIAL_KEYS) {
    const value = env[key];
    if (typeof value !== 'string' || value.trim() === '') {
      delete env[key];
    }
  }

  return env;
}

export function hasWindowsSigningCredentials(env = process.env) {
  const link = env.WIN_CSC_LINK ?? env.CSC_LINK;
  return typeof link === 'string' && link.trim() !== '';
}

/**
 * Release mode is only meaningful inside the tag-gated workflow. Anything else
 * would publish artifacts from an unreviewed tree, so the inputs are checked
 * before any platform build work starts.
 */
export function resolveReleaseModeProblems({ env = process.env, tag = null } = {}) {
  const problems = [];

  const candidateTag = typeof tag === 'string' && tag.trim() !== ''
    ? tag
    : env.GITHUB_REF_NAME ?? '';
  const parsedTag = parseStableReleaseTag(candidateTag);
  if (!parsedTag.ok) {
    problems.push({
      code: `release_${parsedTag.code}`,
      message: `Release mode requires a stable vX.Y.Z tag. ${parsedTag.message}`,
    });
  }

  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  if (typeof token !== 'string' || token.trim() === '') {
    problems.push({
      code: 'release_token_missing',
      message: 'Release mode requires GH_TOKEN or GITHUB_TOKEN for the GitHub publish provider.',
    });
  }

  return problems;
}

async function runCommand(command, args, cwd, envOverrides = {}, envOptions = {}) {
  const invocation = await resolveCommandInvocation(command, args);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env: buildInstallerEnvironment({
        ...process.env,
        ...envOverrides,
      }, envOptions),
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

async function prepareNativeBuildRoot() {
  await rm(NATIVE_BUILD_ROOT, { recursive: true, force: true });
  await mkdir(NATIVE_BUILD_ROOT, { recursive: true });
  await writeFile(
    resolve(NATIVE_BUILD_ROOT, 'README.txt'),
    'Native helper binaries staged for the Cats desktop installer.\n',
    'utf8',
  );
}

async function ensureMobileSkipPlaceholder() {
  await mkdir(MOBILE_BUILD_ROOT, { recursive: true });
  await writeFile(
    resolve(MOBILE_BUILD_ROOT, '.skip-marker'),
    'Mobile bundle was skipped at build time (CATS_SKIP_MOBILE / --skip-mobile).\n'
      + 'This artifact does not include an OTA-updatable mobile bundle, so keep\n'
      + 'CATS_DESKTOP_MOBILE_PAIRING_ENABLED=false for the matching runtime.\n',
    'utf8',
  );
}

async function buildMacosVoiceHelper() {
  if (process.platform !== 'darwin') {
    throw new Error('The macOS voice helper must be built on macOS.');
  }

  const packageRoot = resolve(PROJECT_ROOT, 'desktop', 'native', 'macos-stt');
  await runCommand('swift', ['build', '-c', 'release', '--package-path', packageRoot], PROJECT_ROOT);

  const outputDir = resolve(NATIVE_BUILD_ROOT, 'macos-stt');
  await mkdir(outputDir, { recursive: true });
  await copyFile(
    resolve(packageRoot, '.build', 'release', 'cats-stt-macos'),
    resolve(outputDir, 'cats-stt-macos'),
  );
}

async function buildWindowsVoiceHelper(archOverride) {
  if (process.platform !== 'win32') {
    throw new Error('The Windows voice helper must be built on Windows.');
  }

  const runtime = archOverride === 'arm64' ? 'win-arm64' : 'win-x64';
  const outputDir = resolve(NATIVE_BUILD_ROOT, 'windows-stt');
  await mkdir(outputDir, { recursive: true });
  await runCommand(
    'dotnet',
    [
      'publish',
      resolve(PROJECT_ROOT, 'desktop', 'native', 'windows-stt', 'CatsSttWindows.csproj'),
      '-c',
      'Release',
      '-r',
      runtime,
      '--self-contained',
      'true',
      '-o',
      outputDir,
    ],
    PROJECT_ROOT,
  );
}

async function buildNativeVoiceHelpers(target, archOverride) {
  await prepareNativeBuildRoot();
  if (target === 'macos') {
    await buildMacosVoiceHelper();
    return;
  }
  if (target === 'windows') {
    await buildWindowsVoiceHelper(archOverride);
  }
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

export function electronBuilderArgs(target, archOverride, formatOverride, options = {}) {
  if (archOverride !== null && !VALID_ARCHES[target].includes(archOverride)) {
    throw new Error(
      `Unsupported arch '${archOverride}' for ${target}. Valid: ${VALID_ARCHES[target].join(', ')}`,
    );
  }

  const releaseMode = options.releaseMode === true;
  const signWindowsExecutable = options.signWindowsExecutable === true;
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

  // package.json pins signAndEditExecutable to false so unsigned local builds
  // avoid the winCodeSign download. A release build with real credentials has
  // to opt back in, and only then.
  if (releaseMode && target === 'windows' && signWindowsExecutable) {
    args.push('-c.win.signAndEditExecutable=true');
  }

  args.push('--publish', releaseMode ? 'always' : 'never');
  return args;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const resolvedTarget = resolveBuilderTarget(parsed.target);
  const envOptions = { releaseMode: parsed.releaseMode };

  if (parsed.releaseMode) {
    const problems = resolveReleaseModeProblems({ env: process.env });
    if (problems.length > 0) {
      throw new Error(
        `Release mode inputs are not valid:\n${problems
          .map((problem) => `  ${problem.code}: ${problem.message}`)
          .join('\n')}`,
      );
    }
    process.stdout.write(
      `[build-desktop-installer] release mode active for ${process.env.GITHUB_REF_NAME}.\n`,
    );
  }

  const sidecarBuildEnv = {
    CATS_DESKTOP_SIDECAR_LAYOUT: parsed.sidecarLayout,
  };
  await runCommand('npm', ['run', 'build'], RUNTIME_ROOT, sidecarBuildEnv, envOptions);
  const platformBuildScript = parsed.skipMobile ? 'build:no-mobile' : 'build';
  if (parsed.skipMobile) {
    process.stdout.write(
      '[build-desktop-installer] CATS_SKIP_MOBILE active — running build:no-mobile and seeding build/mobile/.skip-marker after build.\n',
    );
  }
  await runCommand('npm', ['run', platformBuildScript], PROJECT_ROOT, sidecarBuildEnv, envOptions);
  if (parsed.skipMobile) {
    await ensureMobileSkipPlaceholder();
  }
  await buildNativeVoiceHelpers(resolvedTarget, parsed.arch);
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
    envOptions,
  );
  await runCommand(
    'npx',
    electronBuilderArgs(resolvedTarget, parsed.arch, parsed.format, {
      releaseMode: parsed.releaseMode,
      signWindowsExecutable: hasWindowsSigningCredentials(process.env),
    }),
    PROJECT_ROOT,
    {},
    envOptions,
  );
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
