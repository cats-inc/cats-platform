import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  resolveDesktopUpdateConfig,
  type DesktopUpdateConfig,
} from './update.js';
import { parseDesktopBoolean } from './env.js';
import { normalizeDesktopHost } from './security.js';
import {
  resolvePlatformStatePath,
} from './platformPaths.js';

export interface DesktopHostPaths {
  platformDir: string;
  platformStateDir: string;
  platformConfigDir: string;
  platformBundledConfigDir: string;
  runtimeRootDir: string;
  runtimeConfigDir: string;
  appEntryScript: string;
  runtimeEntryScript: string;
  preloadScript: string;
  appStatePath: string;
  runtimeDataDir: string;
  runtimeSessionBaseDir: string;
  runtimeConfigPath: string;
  runtimeManagementConfigPath: string;
  runtimeCuratedModelCatalogPath: string;
  hostStatePath: string;
  hostLogsDir: string;
  packagingOutputRoot: string;
}

export interface DesktopHostBackgroundConfig {
  trayEnabled: boolean;
  keepServicesRunning: boolean;
  closeBehavior: 'quit' | 'minimize_to_tray';
}

export interface DesktopHostSetupAuditConfig {
  parallel: boolean;
}

export interface DesktopHostConfig {
  packaged: boolean;
  packageRoot: string;
  runtimePackageRoot: string;
  userDataDir: string;
  catsHomeDir: string;
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
  setupAudit: DesktopHostSetupAuditConfig;
  update: DesktopUpdateConfig;
  paths: DesktopHostPaths;
}

interface ResolveDesktopHostConfigOptions {
  env?: NodeJS.ProcessEnv;
  userDataDir: string;
  catsHomeDir?: string;
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
const DEFAULT_FORCE_QUIT_ON_CLOSE = false;
const DEFAULT_SETUP_AUDIT_PARALLEL = true;
export const DESKTOP_USER_DATA_DIR_NAME = 'Cats';

function isWindowsAbsolutePath(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\');
}

function isAbsoluteDesktopPath(value: string | undefined): boolean {
  return Boolean(value && (isWindowsAbsolutePath(value) || isAbsolute(value)));
}

function resolveDesktopPath(value: string): string {
  return isWindowsAbsolutePath(value)
    ? win32.normalize(value)
    : resolve(value);
}

function joinDesktopPath(basePath: string, ...segments: string[]): string {
  return isWindowsAbsolutePath(basePath)
    ? win32.join(basePath, ...segments)
    : join(basePath, ...segments);
}

function dirnameDesktopPath(value: string): string {
  return isWindowsAbsolutePath(value)
    ? win32.dirname(win32.normalize(value))
    : dirname(resolve(value));
}

export function resolveCatsHomeDir(): string {
  return resolveDesktopPath(joinDesktopPath(homedir(), '.cats'));
}

export function resolveDesktopUserDataDir(appDataDir: string): string {
  return resolveDesktopPath(joinDesktopPath(appDataDir, DESKTOP_USER_DATA_DIR_NAME));
}

function readCurrentPackageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function resolveHostRuntimeRoot(
  packaged: boolean,
  currentPackageRoot: string,
  resourcesPath: string | undefined,
): {
  hostPackageRoot: string;
  appSidecarRoot: string;
  runtimePackageRoot: string;
  platformBundledConfigDir: string;
} {
  if (!packaged) {
    return {
      hostPackageRoot: currentPackageRoot,
      appSidecarRoot: currentPackageRoot,
      runtimePackageRoot: resolve(joinDesktopPath(currentPackageRoot, '..', 'cats-runtime')),
      platformBundledConfigDir: resolveDesktopPath(joinDesktopPath(currentPackageRoot, 'config')),
    };
  }

  const bundledResourcesRoot = resourcesPath
    ? resolveDesktopPath(resourcesPath)
    : resolve(joinDesktopPath(currentPackageRoot, '..'));
  return {
    hostPackageRoot: resolveDesktopPath(joinDesktopPath(bundledResourcesRoot, 'app.asar')),
    appSidecarRoot: resolveDesktopPath(joinDesktopPath(bundledResourcesRoot, 'app-sidecar')),
    runtimePackageRoot: resolveDesktopPath(joinDesktopPath(bundledResourcesRoot, 'cats-runtime')),
    platformBundledConfigDir: resolveDesktopPath(
      joinDesktopPath(bundledResourcesRoot, 'cats-platform', 'config'),
    ),
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
  const explicitAppEntry = env.CATS_DESKTOP_APP_ENTRY?.trim();
  const inferredPackageRoot = explicitAppEntry
    ? resolveDesktopPath(joinDesktopPath(dirnameDesktopPath(explicitAppEntry), '..', '..'))
    : undefined;
  const packageRoot = resolveDesktopPath(
    env.CATS_DESKTOP_APP_ROOT?.trim() || inferredPackageRoot || layout.appSidecarRoot,
  );
  const runtimePackageRoot = resolveDesktopPath(
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
  const userDataDir = resolveDesktopPath(options.userDataDir);
  const catsHomeDir = resolveDesktopPath(options.catsHomeDir ?? resolveCatsHomeDir());
  const platformDir = resolveDesktopPath(
    env.CATS_PLATFORM_DIR?.trim()
      || joinDesktopPath(catsHomeDir, 'platform'),
  );
  const platformStateDir = resolveDesktopPath(
    joinDesktopPath(platformDir, 'state'),
  );
  const platformConfigDir = resolveDesktopPath(
    joinDesktopPath(platformDir, 'config'),
  );
  const runtimeRootDir = resolveDesktopPath(
    env.CATS_RUNTIME_DIR?.trim()
      || joinDesktopPath(catsHomeDir, 'runtime'),
  );
  const runtimeConfigDir = resolveDesktopPath(
    joinDesktopPath(runtimeRootDir, 'config'),
  );
  const desktopDir = resolveDesktopPath(
    env.CATS_DESKTOP_DIR?.trim()
      || joinDesktopPath(catsHomeDir, 'desktop'),
  );
  const forceQuitOnClose = parseDesktopBoolean(
    env.CATS_DESKTOP_FORCE_QUIT_ON_CLOSE,
    DEFAULT_FORCE_QUIT_ON_CLOSE,
  );
  const background: DesktopHostBackgroundConfig = {
    trayEnabled: forceQuitOnClose ? false : DEFAULT_DESKTOP_TRAY_ENABLED,
    keepServicesRunning: forceQuitOnClose ? false : DEFAULT_KEEP_SERVICES_RUNNING,
    closeBehavior: forceQuitOnClose ? 'quit' : DEFAULT_CLOSE_BEHAVIOR,
  };
  const setupAudit: DesktopHostSetupAuditConfig = {
    parallel: parseDesktopBoolean(
      env.CATS_DESKTOP_SETUP_AUDIT_PARALLEL,
      DEFAULT_SETUP_AUDIT_PARALLEL,
    ),
  };
  const update = resolveDesktopUpdateConfig(env);

  return {
    packaged: options.packaged === true,
    packageRoot,
    runtimePackageRoot,
    userDataDir,
    catsHomeDir,
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
    setupAudit,
    update,
    paths: {
      platformDir,
      platformStateDir,
      platformConfigDir,
      platformBundledConfigDir: layout.platformBundledConfigDir,
      runtimeRootDir,
      runtimeConfigDir,
      appEntryScript: resolveDesktopPath(
        env.CATS_DESKTOP_APP_ENTRY?.trim() || joinDesktopPath(packageRoot, 'build', 'server', 'index.js'),
      ),
      runtimeEntryScript: resolveDesktopPath(
        env.CATS_DESKTOP_RUNTIME_ENTRY?.trim()
          || joinDesktopPath(runtimePackageRoot, 'build', 'runtime', 'index.js'),
      ),
      preloadScript: resolveDesktopPath(
        env.CATS_DESKTOP_PRELOAD_SCRIPT?.trim()
          || joinDesktopPath(
            options.packaged === true ? layout.hostPackageRoot : packageRoot,
            'build',
            'desktop',
            'preload.cjs',
          ),
      ),
      appStatePath: resolveDesktopPath(resolvePlatformStatePath(platformDir)),
      runtimeDataDir: resolveDesktopPath(joinDesktopPath(runtimeRootDir, 'data')),
      runtimeSessionBaseDir: resolveDesktopPath(joinDesktopPath(runtimeRootDir, 'sessions')),
      runtimeConfigPath: resolveDesktopPath(joinDesktopPath(runtimeConfigDir, 'providers.yaml')),
      runtimeManagementConfigPath: resolveDesktopPath(
        joinDesktopPath(runtimeConfigDir, 'management.yaml'),
      ),
      runtimeCuratedModelCatalogPath: resolveDesktopPath(
        joinDesktopPath(runtimeConfigDir, 'curated-model-catalogs.yaml'),
      ),
      hostStatePath: resolveDesktopPath(joinDesktopPath(desktopDir, 'state.json')),
      hostLogsDir: resolveDesktopPath(joinDesktopPath(desktopDir, 'logs')),
      packagingOutputRoot: resolveDesktopPath(
        env.CATS_DESKTOP_PACKAGING_OUTPUT_ROOT?.trim()
          || joinDesktopPath(packageRoot, 'build', 'desktop-packaging'),
      ),
    },
  };
}
