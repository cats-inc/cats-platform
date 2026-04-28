#!/usr/bin/env -S npx tsx

/**
 * PLAN-077 Phase 1 developer flag-toggle entry point.
 *
 * Routes through the same `setFeatureFlag` contract the HTTP writer
 * uses, so a `production` build still rejects locked-entry `true`
 * writes (`feature_flag_blocked: phase2_profile_read_model_guards`).
 * Persists via the same atomic write helper.
 *
 * Usage:
 *   npm run dev:toggle-flag -- <flag-name> <true|false> [--chat-state <path>]
 *   tsx scripts/dev-toggle-feature-flag.mts <flag-name> <true|false> [...]
 *
 * `--chat-state` defaults to
 *   `<CATS_PLATFORM_DIR or default>/state/chat-state.local.json`,
 * matching the runtime's resolution. Pass an explicit path to target a
 * test workspace.
 */

import process from 'node:process';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_CHANNEL } from '../src/shared/buildChannel.js';
import { setFeatureFlag } from '../src/shared/featureFlags.js';
import {
  readPersistedPlatformFeatureFlags,
  writePersistedPlatformFeatureFlags,
} from '../src/shared/featureFlagsStore.js';
import {
  resolveDefaultChatStatePath,
  resolveDefaultPlatformDir,
  resolvePlatformFeatureFlagsPathFromChatState,
} from '../src/shared/platformPaths.js';

interface ParsedArgs {
  help: boolean;
  name: string | null;
  value: string | null;
  chatStatePath: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let name: string | null = null;
  let value: string | null = null;
  let chatStatePath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--chat-state') {
      chatStatePath = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      return { help: true, name: null, value: null, chatStatePath: null };
    }
    if (name === null) {
      name = arg;
      continue;
    }
    if (value === null) {
      value = arg;
      continue;
    }
    throw new Error(`Unexpected positional argument: ${arg}`);
  }
  return { help: false, name, value, chatStatePath };
}

function parseBoolean(raw: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`<value> must be 'true' or 'false', received ${JSON.stringify(raw)}`);
}

function printHelp(): void {
  process.stdout.write(
    'Usage: tsx scripts/dev-toggle-feature-flag.mts <flag-name> <true|false> '
      + '[--chat-state <path>]\n',
  );
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }
  if (!parsed.name || parsed.value === null) {
    printHelp();
    process.exit(1);
  }

  const value = parseBoolean(parsed.value);
  const chatStatePath = parsed.chatStatePath
    ?? resolveDefaultChatStatePath(resolveDefaultPlatformDir());
  const flagsPath = resolvePlatformFeatureFlagsPathFromChatState(chatStatePath);

  const current = await readPersistedPlatformFeatureFlags(flagsPath);
  const result = setFeatureFlag({
    name: parsed.name,
    value,
    buildChannel: BUILD_CHANNEL,
    current,
  });

  if (result.status === 'unknown_flag') {
    process.stderr.write(`unknown_flag: ${result.name}\n`);
    process.exit(2);
  }
  if (result.status === 'feature_flag_blocked') {
    process.stderr.write(`${result.reason}\n`);
    process.stderr.write(
      `(buildChannel=${BUILD_CHANNEL}; rebuild without `
        + `production bake or wait for the unlock condition.)\n`,
    );
    process.exit(3);
  }

  const next = { ...current, [parsed.name]: result.nextValue };
  await writePersistedPlatformFeatureFlags(flagsPath, next);

  process.stdout.write(
    `ok: ${parsed.name} ${result.previousValue ?? 'null'} -> ${result.nextValue} `
      + `(buildChannel=${BUILD_CHANNEL}, persisted at ${flagsPath})\n`,
  );
}

const SCRIPT_PATH = resolvePath(fileURLToPath(import.meta.url));
if (resolvePath(process.argv[1] ?? '') === SCRIPT_PATH) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
