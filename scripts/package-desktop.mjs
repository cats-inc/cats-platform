#!/usr/bin/env node

import process from 'node:process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DESKTOP_ICON_MANIFEST_RELATIVE_PATH = 'assets/build/icon-manifest.json';
const REQUIRED_DESKTOP_ICON_RELATIVE_PATHS = [
  'assets/build/icon.png',
  'assets/build/icon.ico',
  'assets/build/icon.icns',
  'assets/build/installerIcon.ico',
  'assets/build/uninstallerIcon.ico',
  'assets/build/installerHeaderIcon.ico',
  'assets/build/icons/linux/16x16.png',
  'assets/build/icons/linux/24x24.png',
  'assets/build/icons/linux/32x32.png',
  'assets/build/icons/linux/48x48.png',
  'assets/build/icons/linux/64x64.png',
  'assets/build/icons/linux/128x128.png',
  'assets/build/icons/linux/256x256.png',
  'assets/build/icons/linux/512x512.png',
  'assets/tray-icon.png',
  'assets/tray-icon@2x.png',
  'assets/tray-iconTemplate.png',
  'assets/tray-iconTemplate@2x.png',
];

function printHelp() {
  process.stdout.write(`Usage: node scripts/package-desktop.mjs [options]

Options:
  --platform <all|windows|macos|linux>  Filter staged target manifests
  --output-dir <path>                   Override packaging output root
  --sidecar-layout <split|bundle>       Choose loose-file or bundled sidecars for both app/runtime
  --help                                Show this help text
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
  let platform = 'all';
  let outputDir = null;
  let sidecarLayout = resolveSidecarLayout(env.CATS_DESKTOP_SIDECAR_LAYOUT);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, platform, outputDir, sidecarLayout };
    }
    if (value === '--platform') {
      platform = argv[index + 1] ?? 'all';
      index += 1;
      continue;
    }
    if (value === '--output-dir') {
      outputDir = argv[index + 1] ?? null;
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

  return { help: false, platform, outputDir, sidecarLayout };
}

export function resolveRequiredDesktopIconPaths(projectRoot = PROJECT_ROOT) {
  return [
    ...REQUIRED_DESKTOP_ICON_RELATIVE_PATHS,
    DESKTOP_ICON_MANIFEST_RELATIVE_PATH,
  ].map((relativePath) => resolve(projectRoot, relativePath));
}

function listDesktopIconManifestAssetPaths(manifest) {
  return [
    manifest?.app?.png,
    manifest?.app?.ico,
    manifest?.app?.icns,
    manifest?.app?.installerIcon,
    manifest?.app?.uninstallerIcon,
    manifest?.app?.installerHeaderIcon,
    ...Object.values(manifest?.app?.linuxIcons ?? {}),
    manifest?.tray?.default,
    manifest?.tray?.retina,
    manifest?.tray?.template,
    manifest?.tray?.templateRetina,
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

async function readDesktopIconManifest(projectRoot = PROJECT_ROOT) {
  const manifestPath = resolve(projectRoot, DESKTOP_ICON_MANIFEST_RELATIVE_PATH);
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Invalid desktop icon manifest: ${DESKTOP_ICON_MANIFEST_RELATIVE_PATH}. ${
        error instanceof Error ? error.message : 'Unable to parse manifest.'
      }`,
    );
  }
}

async function assertDesktopIconManifestMatchesRequiredAssets(projectRoot = PROJECT_ROOT) {
  const manifest = await readDesktopIconManifest(projectRoot);
  const manifestPaths = listDesktopIconManifestAssetPaths(manifest);
  const manifestPathSet = new Set(manifestPaths);
  const requiredPathSet = new Set(REQUIRED_DESKTOP_ICON_RELATIVE_PATHS);
  const missingFromManifest = REQUIRED_DESKTOP_ICON_RELATIVE_PATHS
    .filter((relativePath) => !manifestPathSet.has(relativePath));
  if (missingFromManifest.length > 0) {
    throw new Error(
      `Desktop icon manifest is missing generated asset: ${missingFromManifest[0]}. `
      + 'Run `npm run desktop:icons` before packaging.',
    );
  }

  const unexpectedManifestPath = manifestPaths.find((relativePath) =>
    !requiredPathSet.has(relativePath));
  if (unexpectedManifestPath) {
    throw new Error(
      `Desktop icon manifest references unexpected asset: ${unexpectedManifestPath}. `
      + 'Run `npm run desktop:icons` before packaging.',
    );
  }
}

export async function assertDesktopIconAssetsPresent(projectRoot = PROJECT_ROOT) {
  const requiredPaths = resolveRequiredDesktopIconPaths(projectRoot);
  for (let index = 0; index < requiredPaths.length; index += 1) {
    const absolutePath = requiredPaths[index];
    try {
      await access(absolutePath);
    } catch {
      throw new Error(
        `Missing required desktop icon asset: ${REQUIRED_DESKTOP_ICON_RELATIVE_PATHS[index]}. `
        + 'Prepare the file manually or run `npm run desktop:icons` before packaging.',
      );
    }
  }
  await assertDesktopIconManifestMatchesRequiredAssets(projectRoot);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const allowedPlatforms = parsed.platform === 'all'
    ? null
    : ['windows', 'macos', 'linux'].includes(parsed.platform)
      ? [parsed.platform]
      : null;
  if (parsed.platform !== 'all' && allowedPlatforms === null) {
    throw new Error(`Unsupported platform filter: ${parsed.platform}`);
  }

  const { resolveDesktopHostConfig } = await import('../build/desktop/config.js');
  const { stageDesktopPackagingOutputs } = await import('../build/desktop/packaging.js');

  await assertDesktopIconAssetsPresent(PROJECT_ROOT);
  const config = resolveDesktopHostConfig({
    env: process.env,
    userDataDir: resolve(PROJECT_ROOT, '.desktop-package-user'),
  });
  const plan = await stageDesktopPackagingOutputs(config, {
    outputRoot: parsed.outputDir ? resolve(PROJECT_ROOT, parsed.outputDir) : undefined,
    platforms: allowedPlatforms,
    sidecarLayout: parsed.sidecarLayout,
  });

  process.stdout.write(JSON.stringify({
    outputRoot: plan.outputRoot,
    sidecarLayout: plan.sidecarLayout,
    targets: plan.targets.map((target) => ({
      id: target.id,
      platform: target.platform,
      arch: target.arch,
      stageDirectory: target.stageDirectory,
      installerFormats: target.installerFormats,
    })),
  }, null, 2));
  process.stdout.write('\n');
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
