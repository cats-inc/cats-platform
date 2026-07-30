#!/usr/bin/env node

import process from 'node:process';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { parseStableReleaseTag } from './validate-release-version.mjs';
import { DESCRIPTOR_RELATIVE_PATH } from './generate-desktop-release-descriptor.mjs';

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
  --release                               Build an official release package: embed the release
                                          descriptor, require platform signing credentials, and
                                          allow signing identity discovery. Requires a GitHub
                                          Actions tag run whose tag matches the package version.
                                          Also honored via CATS_DESKTOP_RELEASE_MODE=1.
  --preview                               Build an unsupported unsigned GitHub prerelease preview.
                                          Requires the same tag/version provenance as --release,
                                          omits the official descriptor, and disables signing
                                          identity discovery. Also honored via
                                          CATS_DESKTOP_PREVIEW_MODE=1.
  --publish <never|always>                Publish policy, default never. Publishing requires
                                          --release or --preview plus a GitHub token. Also honored
                                          via CATS_DESKTOP_PUBLISH.
  --help                                  Show this help text.

Without --arch/--format, the electron-builder target matrix from package.json is preserved.

Release mode and publishing are orthogonal. Stable releases are official and signed. Preview mode
may publish an unsigned prerelease but never embeds official update identity or discovers signing
identities. Local packaging is unofficial and never publishes.
`);
}

function parseBooleanFlag(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Publishing is orthogonal to building an official package. Stable tag builds
 * publish; an explicit official validation may still select `never`.
 */
export function resolvePublishPolicy(value) {
  if (value === undefined || value === null || value === '') {
    return 'never';
  }
  if (value === 'never' || value === 'always') {
    return value;
  }
  throw new Error(`Unsupported publish policy: ${value}`);
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
  let previewMode = parseBooleanFlag(env.CATS_DESKTOP_PREVIEW_MODE);
  let publish = resolvePublishPolicy(env.CATS_DESKTOP_PUBLISH);
  // GITHUB_REF_NAME is a runner-provided default. A workflow `env:` block
  // cannot override anything in the GITHUB_ namespace, and a preview run is
  // dispatched from a branch, so the tag has to arrive as an explicit input.
  let tag = (env.CATS_DESKTOP_RELEASE_TAG ?? env.GITHUB_REF_NAME ?? '').trim();

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return {
        help: true,
        target,
        arch,
        format,
        sidecarLayout,
        skipMobile,
        releaseMode,
        previewMode,
        publish,
        tag,
      };
    }
    if (value === '--release') {
      releaseMode = true;
      continue;
    }
    if (value === '--no-release') {
      releaseMode = false;
      continue;
    }
    if (value === '--preview') {
      previewMode = true;
      continue;
    }
    if (value === '--no-preview') {
      previewMode = false;
      continue;
    }
    if (value === '--publish') {
      publish = resolvePublishPolicy(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (value === '--tag') {
      tag = (argv[index + 1] ?? '').trim();
      index += 1;
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

  return {
    help: false,
    target,
    arch,
    format,
    sidecarLayout,
    skipMobile,
    releaseMode,
    previewMode,
    publish,
    tag,
  };
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

export function hasMacosSigningCredentials(env = process.env) {
  const link = env.CSC_LINK;
  return typeof link === 'string' && link.trim() !== '';
}

/**
 * Signing is a release gate, not a nice-to-have.
 *
 * SPEC-111 section 9 forbids advertising stable self-update on Windows or
 * macOS before signing is available and validated, and the workflow publishes
 * whatever the platform job produced. Without this check a missing secret would
 * quietly ship unsigned stable binaries.
 */
export function resolveSigningProblems({ env = process.env, target } = {}) {
  if (target === 'windows' && !hasWindowsSigningCredentials(env)) {
    return [{
      code: 'release_windows_signing_missing',
      message: 'An official Windows release requires WIN_CSC_LINK or CSC_LINK.',
    }];
  }

  if (target === 'macos' && !hasMacosSigningCredentials(env)) {
    return [{
      code: 'release_macos_signing_missing',
      message: 'An official macOS release requires CSC_LINK.',
    }];
  }

  return [];
}

/**
 * Release and preview publication are only meaningful inside the guarded
 * workflow. Anything else could publish from an unreviewed tree, so the
 * provenance inputs are checked before any platform build work starts.
 *
 * `.env` is loaded at module scope for developer convenience, which means
 * A mode environment variable alone must never be enough. The checks below
 * require the surrounding workflow to be real and the selected tag to match
 * the package version.
 */
export function resolveReleaseModeProblems({
  env = process.env,
  tag = null,
  target = null,
  packageVersion = null,
  publish = 'never',
  requireSigning = true,
  requireTagRef = true,
} = {}) {
  const problems = [];

  if (env.GITHUB_ACTIONS !== 'true') {
    problems.push({
      code: 'release_not_in_workflow',
      message: 'Release and preview modes only run inside GitHub Actions (GITHUB_ACTIONS=true).',
    });
  }

  // Only a stable release is triggered by a tag push, so only it can assert a
  // tag ref. A preview is dispatched from a branch and creates its tag as part
  // of the run, so requiring one here would reject every preview.
  //
  // GITHUB_REF_TYPE is runner-provided and cannot be overridden from a
  // workflow `env:` block, so this reads the real trigger rather than
  // something the workflow claimed.
  if (requireTagRef && env.GITHUB_REF_TYPE !== undefined && env.GITHUB_REF_TYPE !== 'tag') {
    problems.push({
      code: 'release_ref_not_tag',
      message: `A stable release requires a tag ref, but GITHUB_REF_TYPE is '${env.GITHUB_REF_TYPE}'.`,
    });
  }

  const candidateTag = typeof tag === 'string' && tag.trim() !== ''
    ? tag
    : env.GITHUB_REF_NAME ?? '';
  const parsedTag = parseStableReleaseTag(candidateTag);
  if (!parsedTag.ok) {
    problems.push({
      code: `release_${parsedTag.code}`,
      message: `Release and preview modes require a vX.Y.Z tag. ${parsedTag.message}`,
    });
  } else if (typeof packageVersion === 'string' && packageVersion !== parsedTag.version) {
    problems.push({
      code: 'release_version_mismatch',
      message: `Tag ${parsedTag.tag} does not match package version ${packageVersion}.`,
    });
  }

  if (requireSigning) {
    problems.push(...resolveSigningProblems({ env, target }));
  }

  // Only publishing needs a token; non-publishing validation does not.
  if (publish !== 'never') {
    const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
    if (typeof token !== 'string' || token.trim() === '') {
      problems.push({
        code: 'release_token_missing',
        message: 'Publishing requires GH_TOKEN or GITHUB_TOKEN for the GitHub provider.',
      });
    }
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

/**
 * Local packaging must never ship an official release descriptor. Removing it
 * rather than merely not writing it also clears a stale descriptor left behind
 * by an earlier release build in the same working tree.
 */
async function ensureReleaseDescriptorAbsent() {
  await rm(resolve(PROJECT_ROOT, DESCRIPTOR_RELATIVE_PATH), { force: true });
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

/**
 * Asks SwiftPM where it put the binary instead of reconstructing the path.
 *
 * The layout differs per invocation: a plain build lands in `.build/release`,
 * a single `--arch` cross-build in a triple-specific directory, and a
 * multi-arch build in an Xcode-style `.build/apple/Products/Release`. Guessing
 * wrong fails only after the compile succeeds, which reads like a build error
 * when it is really a copy error.
 */
async function resolveSwiftBinPath(packageRoot, swiftArgs) {
  const invocation = await resolveCommandInvocation('swift', [...swiftArgs, '--show-bin-path']);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: PROJECT_ROOT,
      env: buildInstallerEnvironment({ ...process.env }, {}),
      stdio: ['ignore', 'pipe', 'inherit'],
      shell: false,
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`swift --show-bin-path exited with code ${code ?? 'null'}`));
        return;
      }
      const binPath = out.trim().split(/\r?\n/u).filter(Boolean).at(-1);
      if (!binPath) {
        reject(new Error('swift --show-bin-path produced no path.'));
        return;
      }
      resolvePromise(binPath);
    });
    child.once('error', reject);
  });
}

async function buildMacosVoiceHelper(archOverride) {
  if (process.platform !== 'darwin') {
    throw new Error('The macOS voice helper must be built on macOS.');
  }

  const packageRoot = resolve(PROJECT_ROOT, 'desktop', 'native', 'macos-stt');
  const outputDir = resolve(NATIVE_BUILD_ROOT, 'macos-stt');
  await mkdir(outputDir, { recursive: true });

  if (archOverride === 'universal') {
    // A universal DMG merges an x64 and an arm64 app bundle. electron-builder
    // refuses when a binary is byte-identical in both, because it cannot tell
    // whether that is a resource to share or a single-arch executable that
    // should have been lipo'd. Building the helper universal removes the
    // ambiguity instead of suppressing the check.
    const universalArgs = [
      'build',
      '-c',
      'release',
      '--package-path',
      packageRoot,
      '--arch',
      'x86_64',
      '--arch',
      'arm64',
    ];
    await runCommand('swift', universalArgs, PROJECT_ROOT);
    await copyFile(
      resolve(await resolveSwiftBinPath(packageRoot, universalArgs), 'cats-stt-macos'),
      resolve(outputDir, 'cats-stt-macos'),
    );
    return;
  }

  // Cross-compilation is the normal case now: the macOS runner is arm64 while
  // the release targets x64, and an unqualified `swift build` follows the host.
  // That would quietly bundle an arm64 helper inside an x64 app, which only
  // fails when a user tries to dictate.
  const swiftArch = archOverride === 'arm64' ? 'arm64' : 'x86_64';
  const swiftArgs = [
    'build',
    '-c',
    'release',
    '--package-path',
    packageRoot,
    '--arch',
    swiftArch,
  ];
  await runCommand('swift', swiftArgs, PROJECT_ROOT);
  await copyFile(
    resolve(await resolveSwiftBinPath(packageRoot, swiftArgs), 'cats-stt-macos'),
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
    await buildMacosVoiceHelper(archOverride);
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

/**
 * Accepts a single format or a comma-separated list. macOS needs both the DMG
 * users install and the ZIP electron-updater reads, so the release matrix
 * cannot be expressed with one format per platform.
 */
export function normalizeFormats(target, formatOverride) {
  if (formatOverride === null || formatOverride === undefined || formatOverride === '') {
    return null;
  }

  const requested = String(formatOverride).split(',').map((value) => value.trim()).filter(Boolean);
  if (requested.length === 0) {
    return null;
  }

  return requested.map((value) => {
    const canonicalFormat = PLATFORM_FORMATS[target].find(
      (candidate) => candidate.toLowerCase() === value.toLowerCase(),
    );

    if (!canonicalFormat) {
      throw new Error(
        `Unsupported format '${value}' for ${target}. Valid: ${PLATFORM_FORMATS[target].join(', ')}`,
      );
    }

    return canonicalFormat;
  });
}

export function electronBuilderArgs(target, archOverride, formatOverride, options = {}) {
  if (archOverride !== null && !VALID_ARCHES[target].includes(archOverride)) {
    throw new Error(
      `Unsupported arch '${archOverride}' for ${target}. Valid: ${VALID_ARCHES[target].join(', ')}`,
    );
  }

  const releaseMode = options.releaseMode === true;
  const publish = resolvePublishPolicy(options.publish ?? 'never');
  const signWindowsExecutable = options.signWindowsExecutable === true;
  const formats = normalizeFormats(target, formatOverride);
  const platformFlag = target === 'windows' ? '--win' : target === 'macos' ? '--mac' : '--linux';
  const args = ['electron-builder', platformFlag];

  if (formats !== null) {
    args.push(...formats);
  } else if (archOverride !== null) {
    args.push(...PLATFORM_FORMATS[target], `--${archOverride}`);
  }

  if (formats !== null && archOverride !== null) {
    args.push(`--${archOverride}`);
  }

  // package.json pins signAndEditExecutable to false so unsigned local builds
  // avoid the winCodeSign download. A release build with real credentials has
  // to opt back in, and only then.
  if (releaseMode && target === 'windows' && signWindowsExecutable) {
    args.push('-c.win.signAndEditExecutable=true');
  }

  args.push('--publish', publish);
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

  if (parsed.releaseMode && parsed.previewMode) {
    throw new Error('--release and --preview are mutually exclusive build modes.');
  }

  if (parsed.publish !== 'never' && !parsed.releaseMode && !parsed.previewMode) {
    throw new Error('Publishing requires --release or --preview.');
  }

  if (parsed.releaseMode || parsed.previewMode) {
    const { version: packageVersion } = JSON.parse(
      await readFile(resolve(PROJECT_ROOT, 'package.json'), 'utf8'),
    );
    const problems = resolveReleaseModeProblems({
      env: process.env,
      tag: parsed.tag,
      target: resolvedTarget,
      packageVersion,
      publish: parsed.publish,
      requireSigning: parsed.releaseMode,
      requireTagRef: parsed.releaseMode,
    });
    if (problems.length > 0) {
      throw new Error(
        `Release/preview inputs are not valid:\n${problems
          .map((problem) => `  ${problem.code}: ${problem.message}`)
          .join('\n')}`,
      );
    }
    const buildKind = parsed.releaseMode ? 'official' : 'unsigned preview';
    process.stdout.write(
      `[build-desktop-installer] ${buildKind} ${resolvedTarget} build for `
        + `${process.env.GITHUB_REF_NAME} (publish=${parsed.publish}).\n`,
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

  // npm run build wipes build/, so the descriptor has to be written after the
  // platform build and before packaging collects build/desktop.
  //
  // A preview gets a descriptor too, marked `preview`, so the upgrade path can
  // be exercised before signing exists. It resolves to its own distribution
  // mode, so it never claims official update identity.
  if (parsed.releaseMode || parsed.previewMode) {
    await runCommand(
      'node',
      [
        'scripts/generate-desktop-release-descriptor.mjs',
        '--platform',
        resolvedTarget,
        '--kind',
        parsed.releaseMode ? 'official' : 'preview',
        // Forwarded rather than left to GITHUB_REF_NAME, which is the branch
        // name on a preview dispatch.
        '--tag',
        parsed.tag,
      ],
      PROJECT_ROOT,
      {},
      envOptions,
    );
  } else {
    await ensureReleaseDescriptorAbsent();
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
      publish: parsed.publish,
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
