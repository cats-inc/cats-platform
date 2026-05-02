#!/usr/bin/env node

import process from 'node:process';
import { chmod, copyFile, readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

const PREBUILT_DIR = resolve(
  PROJECT_ROOT, 'mobile', '.hermes-prebuilt', 'aarch64-linux',
);
const PREBUILT_BINARY = resolve(PREBUILT_DIR, 'hermesc');
const PREBUILT_VERSION = resolve(PREBUILT_DIR, '.hermesversion');

const RN_HERMESC_TARGET = resolve(
  PROJECT_ROOT, 'mobile', 'node_modules', 'react-native',
  'sdks', 'hermesc', 'linux64-bin', 'hermesc',
);
const RN_HERMESVERSION = resolve(
  PROJECT_ROOT, 'mobile', 'node_modules', 'react-native',
  'sdks', '.hermesversion',
);

function shouldPatch() {
  return process.platform === 'linux' && process.arch === 'arm64';
}

async function readTrimmed(path) {
  return (await readFile(path, 'utf8')).trim();
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!shouldPatch()) {
    return;
  }

  if (!await exists(RN_HERMESC_TARGET)) {
    process.stdout.write(
      '[patch-mobile-hermesc] react-native hermesc not found; '
        + 'skipping (run `npm ci --prefix mobile` first).\n',
    );
    return;
  }

  if (!await exists(PREBUILT_BINARY) || !await exists(PREBUILT_VERSION)) {
    process.stderr.write(
      '[patch-mobile-hermesc] no prebuilt aarch64 hermesc found at '
        + `${PREBUILT_DIR}.\n`
        + 'Build one on a Pi (see docs) and commit it, or set CATS_SKIP_MOBILE=true.\n',
    );
    process.exitCode = 1;
    return;
  }

  const expected = await readTrimmed(PREBUILT_VERSION);
  const actual = await readTrimmed(RN_HERMESVERSION);

  if (expected !== actual) {
    process.stderr.write(
      '[patch-mobile-hermesc] Hermes SHA mismatch.\n'
        + `  prebuilt:     ${expected}\n`
        + `  react-native: ${actual}\n`
        + 'Rebuild hermesc against the new SHA and refresh '
        + 'mobile/.hermes-prebuilt/aarch64-linux/.\n',
    );
    process.exitCode = 1;
    return;
  }

  await copyFile(PREBUILT_BINARY, RN_HERMESC_TARGET);
  await chmod(RN_HERMESC_TARGET, 0o755);
  process.stdout.write(
    `[patch-mobile-hermesc] patched ${RN_HERMESC_TARGET} with aarch64 build `
      + `(Hermes ${actual.slice(0, 16)}…).\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
