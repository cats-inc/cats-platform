#!/usr/bin/env node

import process from 'node:process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
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
  --help                                Show this help text
`);
}

export function parseArgs(argv) {
  let platform = 'all';
  let outputDir = null;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, platform, outputDir };
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
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, platform, outputDir };
}

export function resolveRequiredDesktopIconPaths(projectRoot = PROJECT_ROOT) {
  return REQUIRED_DESKTOP_ICON_RELATIVE_PATHS.map((relativePath) => resolve(projectRoot, relativePath));
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
  });

  process.stdout.write(JSON.stringify({
    outputRoot: plan.outputRoot,
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
