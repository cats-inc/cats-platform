import path from 'node:path';
import { homedir } from 'node:os';

import { DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT } from './shared/runtimeRecovery.js';

export interface AppConfig {
  host: string;
  port: number;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  debugKeepRuntimeSessionsOnProductDelete: boolean;
  runtimeDataDir?: string;
  desktopHostStatePath?: string;
  runtimeStaleSessionRetryLimit: number;
  chatStatePath: string;
  maxBossCats: number;
  maxCats: number;
  maxParallelChats: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8181;
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:3110';
const DEFAULT_MAX_BOSS_CATS = 1;
const DEFAULT_MAX_CATS = 5;
const DEFAULT_MAX_PARALLEL_CHATS = 5;

function resolveDefaultPlatformDir(): string {
  return path.join(homedir(), '.cats', 'platform');
}

function readFirstDefined(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function parsePort(rawValue: string | undefined, fallback: number): number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port value: ${rawValue}`);
  }

  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  return fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const platformDir = env.CATS_PLATFORM_DIR?.trim()
    || resolveDefaultPlatformDir();
  return {
    host: readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || DEFAULT_HOST,
    port: parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), DEFAULT_PORT),
    runtimeBaseUrl: (env.CATS_RUNTIME_BASE_URL || DEFAULT_RUNTIME_BASE_URL).replace(/\/+$/, ''),
    runtimeApiKey: env.CATS_RUNTIME_API_KEY?.trim() || '',
    debugKeepRuntimeSessionsOnProductDelete: parseBoolean(
      env.CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE,
      false,
    ),
    runtimeDataDir: readFirstDefined(env, ['CATS_RUNTIME_DATA_DIR']) || undefined,
    desktopHostStatePath: readFirstDefined(env, ['CATS_DESKTOP_HOST_STATE_PATH']) || undefined,
    runtimeStaleSessionRetryLimit: parseNonNegativeInt(
      env.CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT,
      DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT,
    ),
    chatStatePath:
      readFirstDefined(env, ['CATS_STATE_PATH', 'CATS_INC_STATE_PATH'])
      || path.join(platformDir, 'chat-state.local.json'),
    maxBossCats: parsePositiveInt(env.CATS_MAX_BOSS_CATS, DEFAULT_MAX_BOSS_CATS),
    maxCats: parsePositiveInt(env.CATS_MAX_CATS, DEFAULT_MAX_CATS),
    maxParallelChats: parsePositiveInt(env.CATS_MAX_PARALLEL_CHATS, DEFAULT_MAX_PARALLEL_CHATS),
  };
}
