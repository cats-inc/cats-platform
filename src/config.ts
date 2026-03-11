import path from 'node:path';

export interface AppConfig {
  host: string;
  port: number;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  workspaceStatePath: string;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8181;
const DEFAULT_RUNTIME_BASE_URL = 'http://127.0.0.1:3110';

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
    host: env.CATS_INC_HOST?.trim() || DEFAULT_HOST,
    port: parsePort(env.CATS_INC_PORT, DEFAULT_PORT),
    runtimeBaseUrl: (env.CATS_RUNTIME_BASE_URL || DEFAULT_RUNTIME_BASE_URL).replace(/\/+$/, ''),
    runtimeApiKey: env.CATS_RUNTIME_API_KEY?.trim() || '',
    workspaceStatePath:
      env.CATS_INC_STATE_PATH?.trim() || path.join(process.cwd(), 'config', 'workspace-state.local.json'),
  };
}
