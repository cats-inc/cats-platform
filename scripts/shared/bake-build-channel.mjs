#!/usr/bin/env node

/**
 * Rewrite the `BUILD_CHANNEL` literal in `src/shared/buildChannel.ts`.
 *
 * PLAN-077 §"Define the buildChannel source of truth in the build pipeline"
 * — staged (`desktop:stage*`) and installer (`desktop:package*`) commands
 * bake `production` into the source before tsc/esbuild compile, then
 * restore `development` after. Repo-run development commands leave the
 * default `development` value untouched.
 *
 * Usage:
 *   node scripts/shared/bake-build-channel.mjs <development|production>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');
const TARGET_FILE = resolve(PROJECT_ROOT, 'src', 'shared', 'buildChannel.ts');

const VALID_CHANNELS = new Set(['development', 'production']);

const BUILD_CHANNEL_PATTERN =
  /(export const BUILD_CHANNEL: PlatformBuildChannel = ')(development|production)(';)/u;

export async function bakeBuildChannel(channel) {
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(
      `Invalid build channel ${JSON.stringify(channel)}; expected 'development' or 'production'.`,
    );
  }

  const source = await readFile(TARGET_FILE, 'utf8');
  const match = source.match(BUILD_CHANNEL_PATTERN);
  if (!match) {
    throw new Error(
      `Could not find the BUILD_CHANNEL literal in ${TARGET_FILE}. The bake helper expects the `
        + `pattern \`export const BUILD_CHANNEL: PlatformBuildChannel = '<channel>';\`.`,
    );
  }

  const previousChannel = match[2];
  if (previousChannel === channel) {
    return { previousChannel, nextChannel: channel, changed: false };
  }

  const replaced = source.replace(BUILD_CHANNEL_PATTERN, `$1${channel}$3`);
  await writeFile(TARGET_FILE, replaced, 'utf8');
  return { previousChannel, nextChannel: channel, changed: true };
}

async function main() {
  const channel = process.argv[2];
  if (channel === undefined) {
    process.stderr.write(
      'Usage: node scripts/shared/bake-build-channel.mjs <development|production>\n',
    );
    process.exit(1);
  }
  try {
    const result = await bakeBuildChannel(channel);
    process.stdout.write(
      `Baked BUILD_CHANNEL = '${result.nextChannel}' (was '${result.previousChannel}'`
        + `${result.changed ? '' : ', no change'}).\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main();
}
