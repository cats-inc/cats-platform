#!/usr/bin/env node

import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function printHelp() {
  process.stdout.write(`Usage: node scripts/package-desktop.mjs [options]

Options:
  --platform <all|windows|macos|linux>  Filter staged target manifests
  --output-dir <path>                   Override packaging output root
  --help                                Show this help text
`);
}

function parseArgs(argv) {
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

  const { resolveDesktopHostConfig } = await import('../dist-electron/config.js');
  const { stageDesktopPackagingOutputs } = await import('../dist-electron/packaging.js');

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

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
