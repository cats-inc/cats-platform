import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DesktopHostPaths {
  appEntryScript: string;
  runtimeEntryScript: string;
  preloadScript: string;
  appStatePath: string;
  runtimeDataDir: string;
  runtimeSessionBaseDir: string;
  runtimeConfigPath: string;
}

export interface DesktopHostConfig {
  packageRoot: string;
  runtimePackageRoot: string;
  userDataDir: string;
  appHost: string;
  appPort: number;
  appBaseUrl: string;
  runtimeHost: string;
  runtimePort: number;
  runtimeBaseUrl: string;
  readinessTimeoutMs: number;
  readinessPollIntervalMs: number;
  gracefulShutdownMs: number;
  paths: DesktopHostPaths;
}

interface ResolveDesktopHostConfigOptions {
  env?: NodeJS.ProcessEnv;
  userDataDir: string;
}

const DEFAULT_LOCAL_HOST = '127.0.0.1';
const DEFAULT_APP_PORT = 8181;
const DEFAULT_RUNTIME_PORT = 3110;
const DEFAULT_READINESS_TIMEOUT_MS = 30000;
const DEFAULT_READINESS_POLL_INTERVAL_MS = 500;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 3000;

function readCurrentPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function parsePositiveInt(rawValue: string | undefined, fallback: number): number {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer value: ${rawValue}`);
  }
  return parsed;
}

function normalizeHost(rawValue: string | undefined, fallback: string): string {
  const trimmed = rawValue?.trim();
  return trimmed || fallback;
}

export function resolveDesktopHostConfig(
  options: ResolveDesktopHostConfigOptions,
): DesktopHostConfig {
  const env = options.env ?? process.env;
  const packageRoot = readCurrentPackageRoot();
  const runtimePackageRoot = resolve(
    env.CATS_DESKTOP_RUNTIME_ROOT?.trim() || join(packageRoot, '..', 'cats-runtime'),
  );
  const appHost = normalizeHost(env.CATS_DESKTOP_APP_HOST || env.CATS_HOST, DEFAULT_LOCAL_HOST);
  const appPort = parsePositiveInt(
    env.CATS_DESKTOP_APP_PORT || env.CATS_PORT,
    DEFAULT_APP_PORT,
  );
  const runtimeHost = normalizeHost(
    env.CATS_DESKTOP_RUNTIME_HOST || env.CATS_RUNTIME_HOST,
    DEFAULT_LOCAL_HOST,
  );
  const runtimePort = parsePositiveInt(
    env.CATS_DESKTOP_RUNTIME_PORT || env.CATS_RUNTIME_PORT,
    DEFAULT_RUNTIME_PORT,
  );
  const readinessTimeoutMs = parsePositiveInt(
    env.CATS_DESKTOP_READINESS_TIMEOUT_MS,
    DEFAULT_READINESS_TIMEOUT_MS,
  );
  const readinessPollIntervalMs = parsePositiveInt(
    env.CATS_DESKTOP_READINESS_POLL_INTERVAL_MS,
    DEFAULT_READINESS_POLL_INTERVAL_MS,
  );
  const gracefulShutdownMs = parsePositiveInt(
    env.CATS_DESKTOP_GRACEFUL_SHUTDOWN_MS,
    DEFAULT_GRACEFUL_SHUTDOWN_MS,
  );
  const userDataDir = resolve(options.userDataDir);

  return {
    packageRoot,
    runtimePackageRoot,
    userDataDir,
    appHost,
    appPort,
    appBaseUrl: `http://${appHost}:${appPort}`,
    runtimeHost,
    runtimePort,
    runtimeBaseUrl: `http://${runtimeHost}:${runtimePort}`,
    readinessTimeoutMs,
    readinessPollIntervalMs,
    gracefulShutdownMs,
    paths: {
      appEntryScript: resolve(
        env.CATS_DESKTOP_APP_ENTRY?.trim() || join(packageRoot, 'dist-server', 'index.js'),
      ),
      runtimeEntryScript: resolve(
        env.CATS_DESKTOP_RUNTIME_ENTRY?.trim() || join(runtimePackageRoot, 'dist', 'index.js'),
      ),
      preloadScript: resolve(join(packageRoot, 'dist-electron', 'preload.js')),
      appStatePath: resolve(
        env.CATS_DESKTOP_STATE_PATH?.trim()
          || join(userDataDir, 'config', 'chat-state.local.json'),
      ),
      runtimeDataDir: resolve(
        env.CATS_DESKTOP_RUNTIME_DATA_DIR?.trim()
          || join(userDataDir, 'runtime', 'data'),
      ),
      runtimeSessionBaseDir: resolve(
        env.CATS_DESKTOP_RUNTIME_SESSION_BASE_DIR?.trim()
          || join(userDataDir, 'runtime', 'sessions'),
      ),
      runtimeConfigPath: resolve(
        env.CATS_DESKTOP_RUNTIME_CONFIG_PATH?.trim()
          || join(userDataDir, 'runtime', 'providers.yaml'),
      ),
    },
  };
}
