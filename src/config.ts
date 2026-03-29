import path from 'node:path';

import { DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT } from './shared/runtimeRecovery.js';

export interface AppConfig {
  host: string;
  port: number;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  runtimeDataDir?: string;
  runtimeStaleSessionRetryLimit: number;
  chatStatePath: string;
  maxBossCats: number;
  maxCats: number;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8181;
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:3110';
const DEFAULT_MAX_BOSS_CATS = 1;
const DEFAULT_MAX_CATS = 5;

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || DEFAULT_HOST,
    port: parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), DEFAULT_PORT),
    runtimeBaseUrl: (env.CATS_RUNTIME_BASE_URL || DEFAULT_RUNTIME_BASE_URL).replace(/\/+$/, ''),
    runtimeApiKey: env.CATS_RUNTIME_API_KEY?.trim() || '',
    runtimeDataDir: readFirstDefined(env, ['CATS_RUNTIME_DATA_DIR']) || undefined,
    runtimeStaleSessionRetryLimit: parseNonNegativeInt(
      env.CATS_RUNTIME_STALE_SESSION_RETRY_LIMIT,
      DEFAULT_RUNTIME_STALE_SESSION_RETRY_LIMIT,
    ),
    chatStatePath:
      readFirstDefined(env, ['CATS_STATE_PATH', 'CATS_INC_STATE_PATH'])
      || path.join(process.cwd(), 'config', 'chat-state.local.json'),
    maxBossCats: parsePositiveInt(env.CATS_MAX_BOSS_CATS, DEFAULT_MAX_BOSS_CATS),
    maxCats: parsePositiveInt(env.CATS_MAX_CATS, DEFAULT_MAX_CATS),
  };
}
