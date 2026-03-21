import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  chatStatePath: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8181;
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:3110';

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    host: readFirstDefined(env, ['CATS_HOST', 'CATS_INC_HOST']) || DEFAULT_HOST,
    port: parsePort(readFirstDefined(env, ['CATS_PORT', 'CATS_INC_PORT']), DEFAULT_PORT),
    runtimeBaseUrl: (env.CATS_RUNTIME_BASE_URL || DEFAULT_RUNTIME_BASE_URL).replace(/\/+$/, ''),
    runtimeApiKey: env.CATS_RUNTIME_API_KEY?.trim() || '',
    chatStatePath:
      readFirstDefined(env, ['CATS_STATE_PATH', 'CATS_INC_STATE_PATH'])
      || path.join(process.cwd(), 'config', 'chat-state.local.json'),
  };
}
