import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveDesktopUpdateConfig,
  type DesktopUpdateConfig,
} from './update.js';
import { normalizeDesktopHost } from './security.js';

export interface DesktopHostPaths {
  appEntryScript: string;
  runtimeEntryScript: string;
  preloadScript: string;
  appStatePath: string;
  runtimeDataDir: string;
  runtimeSessionBaseDir: string;
  runtimeConfigPath: string;
  hostStatePath: string;
  packagingOutputRoot: string;
}

export interface DesktopHostBackgroundConfig {
  trayEnabled: boolean;
  keepServicesRunning: boolean;
  closeBehavior: 'quit' | 'minimize_to_tray';
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
  background: DesktopHostBackgroundConfig;
  update: DesktopUpdateConfig;
  paths: DesktopHostPaths;
}

interface ResolveDesktopHostConfigOptions {
  env?: NodeJS.ProcessEnv;
  userDataDir: string;
  packaged?: boolean;
  resourcesPath?: string;
}

const DEFAULT_LOCAL_HOST = '127.0.0.1';
const DEFAULT_APP_PORT = 8181;
const DEFAULT_RUNTIME_PORT = 3110;
const DEFAULT_READINESS_TIMEOUT_MS = 30000;
const DEFAULT_READINESS_POLL_INTERVAL_MS = 500;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 3000;
const DEFAULT_DESKTOP_TRAY_ENABLED = true;
const DEFAULT_KEEP_SERVICES_RUNNING = true;
const DEFAULT_CLOSE_BEHAVIOR = 'minimize_to_tray';

function readCurrentPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function resolveHostRuntimeRoot(
  packaged: boolean,
  currentPackageRoot: string,
  resourcesPath: string | undefined,
): {
  hostPackageRoot: string;
  appSidecarRoot: string;
  runtimePackageRoot: string;
} {
  if (!packaged) {
    return {
      hostPackageRoot: currentPackageRoot,
      appSidecarRoot: currentPackageRoot,
      runtimePackageRoot: resolve(join(currentPackageRoot, '..', 'cats-runtime')),
    };
  }

  const bundledResourcesRoot = resolve(resourcesPath || join(currentPackageRoot, '..'));
  return {
    hostPackageRoot: currentPackageRoot,
    appSidecarRoot: resolve(join(bundledResourcesRoot, 'app-sidecar')),
    runtimePackageRoot: resolve(join(bundledResourcesRoot, 'cats-runtime')),
  };
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

function parseBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  const trimmed = rawValue?.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') {
    return true;
  }
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') {
    return false;
  }
  return fallback;
}

function normalizeCloseBehavior(
  rawValue: string | undefined,
): DesktopHostBackgroundConfig['closeBehavior'] {
  const trimmed = rawValue?.trim();
  if (trimmed === 'quit') {
    return 'quit';
  }
  return DEFAULT_CLOSE_BEHAVIOR;
}

export function resolveDesktopHostConfig(
  options: ResolveDesktopHostConfigOptions,
): DesktopHostConfig {
  const env = options.env ?? process.env;
  const hostPackageRoot = readCurrentPackageRoot();
  const layout = resolveHostRuntimeRoot(
    options.packaged === true,
    hostPackageRoot,
    options.resourcesPath,
  );
  const packageRoot = resolve(
    env.CATS_DESKTOP_APP_ROOT?.trim() || layout.appSidecarRoot,
  );
  const runtimePackageRoot = resolve(
    env.CATS_DESKTOP_RUNTIME_ROOT?.trim() || layout.runtimePackageRoot,
  );
  const appHost = normalizeDesktopHost(
    env.CATS_DESKTOP_APP_HOST || env.CATS_HOST,
    DEFAULT_LOCAL_HOST,
  );
  const appPort = parsePositiveInt(
    env.CATS_DESKTOP_APP_PORT || env.CATS_PORT,
    DEFAULT_APP_PORT,
  );
  const runtimeHost = normalizeDesktopHost(
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
  const background: DesktopHostBackgroundConfig = {
    trayEnabled: parseBoolean(
      env.CATS_DESKTOP_TRAY_ENABLED,
      DEFAULT_DESKTOP_TRAY_ENABLED,
    ),
    keepServicesRunning: parseBoolean(
      env.CATS_DESKTOP_KEEP_SERVICES_RUNNING,
      DEFAULT_KEEP_SERVICES_RUNNING,
    ),
    closeBehavior: normalizeCloseBehavior(env.CATS_DESKTOP_CLOSE_BEHAVIOR),
  };
  const update = resolveDesktopUpdateConfig(env);

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
    background,
    update,
    paths: {
      appEntryScript: resolve(
        env.CATS_DESKTOP_APP_ENTRY?.trim() || join(packageRoot, 'dist-server', 'index.js'),
      ),
      runtimeEntryScript: resolve(
        env.CATS_DESKTOP_RUNTIME_ENTRY?.trim() || join(runtimePackageRoot, 'dist', 'index.js'),
      ),
      preloadScript: resolve(join(hostPackageRoot, 'dist-electron', 'preload.cjs')),
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
      hostStatePath: resolve(
        env.CATS_DESKTOP_HOST_STATE_PATH?.trim()
          || join(userDataDir, 'desktop-host', 'state.json'),
      ),
      packagingOutputRoot: resolve(
        env.CATS_DESKTOP_PACKAGING_OUTPUT_ROOT?.trim()
          || join(packageRoot, 'build', 'desktop-packaging'),
      ),
    },
  };
}
