#!/usr/bin/env node

import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_ICON_SHAPE = 'circle';
const SUPPORTED_ICON_SHAPES = new Set(['square', 'circle']);

function printHelp() {
  process.stdout.write(`Usage: node scripts/package-desktop.mjs [options]

Options:
  --platform <all|windows|macos|linux>  Filter staged target manifests
  --output-dir <path>                   Override packaging output root
  --shape <square|circle>               Override icon output shape. Defaults to circle
  --help                                Show this help text
`);
}

function normalizeIconShape(value) {
  if (!value) {
    return DEFAULT_ICON_SHAPE;
  }
  if (!SUPPORTED_ICON_SHAPES.has(value)) {
    throw new Error(`Unsupported icon shape: ${value}`);
  }
  return value;
}

export function parseArgs(argv) {
  let platform = 'all';
  let outputDir = null;
  let shape = DEFAULT_ICON_SHAPE;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      return { help: true, platform, outputDir, shape };
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
    if (value === '--shape') {
      shape = normalizeIconShape(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${value}`);
  }

  return { help: false, platform, outputDir, shape };
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

  const { generateElectronIcons } = await import('./shared/generate-electron-icons.mjs');
  const { resolveDesktopHostConfig } = await import('../build/desktop/config.js');
  const { stageDesktopPackagingOutputs } = await import('../build/desktop/packaging.js');

  await generateElectronIcons({ iconShape: parsed.shape });
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
