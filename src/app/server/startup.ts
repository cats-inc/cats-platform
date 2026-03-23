import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppPackageJson {
  version?: string;
}

function readAppPackageVersion(): string {
  const packageJsonPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'package.json',
  );
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as AppPackageJson;

  if (!packageJson.version) {
    throw new Error(`Could not resolve version from ${packageJsonPath}`);
  }

  return packageJson.version;
}

export const APP_SERVICE_NAME = 'cats';
export const APP_VERSION = readAppPackageVersion();
export const APP_STARTUP_CONTRACT_VERSION = 1;
export const APP_READINESS_PATH = '/health';
export const APP_STARTUP_MODES = [
  'standalone',
  'app-managed',
] as const;
export const APP_READY_OUTPUTS = [
  'plain',
  'json',
  'silent',
] as const;
export const APP_LIFECYCLE_EVENTS = [
  'app.ready',
  'app.startup_error',
  'app.stopping',
  'app.stopped',
] as const;
export const APP_SHUTDOWN_SIGNALS = [
  'SIGINT',
  'SIGTERM',
] as const;
export const APP_SHUTDOWN_REASONS = [
  'sigint',
  'sigterm',
  'stdin_closed',
] as const;

export type AppStartupMode = typeof APP_STARTUP_MODES[number];
export type AppReadyOutput = typeof APP_READY_OUTPUTS[number];
export type AppLifecycleEventName = typeof APP_LIFECYCLE_EVENTS[number];
export type AppShutdownReason = typeof APP_SHUTDOWN_REASONS[number];
export type AppReadySignal = 'http';
export type AppLifecyclePhase = 'starting' | 'ready' | 'stopping' | 'stopped';

export interface AppCliOptions {
  help?: boolean;
  startupMode?: AppStartupMode;
  managedBy?: string;
  readyOutput?: AppReadyOutput;
}

export interface AppListeningAddress {
  host: string;
  port: number;
  healthUrl: string;
}

export interface AppStartupState {
  contractVersion: number;
  mode: AppStartupMode;
  managedBy?: string;
  readyOutput: AppReadyOutput;
  readySignal: AppReadySignal;
  readinessPath: string;
  phase: AppLifecyclePhase;
  pid: number;
  startedAt: string;
  ready: boolean;
  address?: AppListeningAddress;
  shutdownReason?: AppShutdownReason;
  lastEvent?: AppLifecycleEventName;
  version: string;
}

interface AppLifecycleEventPayload {
  event: AppLifecycleEventName;
  service: typeof APP_SERVICE_NAME;
  contractVersion: number;
  version: string;
  pid: number;
  mode: AppStartupMode;
  managedBy?: string;
  startedAt: string;
  timestamp: string;
  phase: AppLifecyclePhase;
  readySignal: AppReadySignal;
  readinessPath: string;
  ready: boolean;
  host?: string;
  port?: number;
  healthUrl?: string;
  reason?: AppShutdownReason;
  error?: string;
}

export interface AppReadinessSnapshot {
  endpoint: string;
  authoritative: true;
  readySignal: AppReadySignal;
  phase: AppLifecyclePhase;
  ready: boolean;
}

export interface AppOperationalStatus {
  status: 'ok' | 'degraded' | 'unavailable';
  summary: string;
}

function isStartupMode(value: string): value is AppStartupMode {
  return (APP_STARTUP_MODES as readonly string[]).includes(value);
}

function isReadyOutput(value: string): value is AppReadyOutput {
  return (APP_READY_OUTPUTS as readonly string[]).includes(value);
}

function readOptionValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseAppCliOptions(argv: string[]): AppCliOptions {
  const options: AppCliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--startup-mode') {
      const value = readOptionValue(argv, index, arg);
      if (!isStartupMode(value)) {
        throw new Error(`Invalid --startup-mode value '${value}'`);
      }
      options.startupMode = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--startup-mode=')) {
      const value = arg.slice('--startup-mode='.length);
      if (!isStartupMode(value)) {
        throw new Error(`Invalid --startup-mode value '${value}'`);
      }
      options.startupMode = value;
      continue;
    }

    if (arg === '--managed-by') {
      options.managedBy = readOptionValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--managed-by=')) {
      options.managedBy = arg.slice('--managed-by='.length);
      continue;
    }

    if (arg === '--ready-output') {
      const value = readOptionValue(argv, index, arg);
      if (!isReadyOutput(value)) {
        throw new Error(`Invalid --ready-output value '${value}'`);
      }
      options.readyOutput = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--ready-output=')) {
      const value = arg.slice('--ready-output='.length);
      if (!isReadyOutput(value)) {
        throw new Error(`Invalid --ready-output value '${value}'`);
      }
      options.readyOutput = value;
      continue;
    }

    throw new Error(`Unknown argument '${arg}'`);
  }

  return options;
}

export function createAppStartupState(
  init: Partial<AppStartupState> = {},
): AppStartupState {
  return {
    contractVersion: init.contractVersion ?? APP_STARTUP_CONTRACT_VERSION,
    mode: init.mode ?? 'standalone',
    managedBy: init.managedBy,
    readyOutput: init.readyOutput ?? 'plain',
    readySignal: init.readySignal ?? 'http',
    readinessPath: init.readinessPath ?? APP_READINESS_PATH,
    phase: init.phase ?? (init.ready ? 'ready' : 'starting'),
    pid: init.pid ?? process.pid,
    startedAt: init.startedAt ?? new Date().toISOString(),
    ready: init.ready ?? false,
    address: init.address,
    shutdownReason: init.shutdownReason,
    lastEvent: init.lastEvent,
    version: init.version ?? APP_VERSION,
  };
}

export function resolveAppStartupState(
  options: AppCliOptions,
  env: NodeJS.ProcessEnv,
): AppStartupState {
  const modeFromEnv = env.CATS_STARTUP_MODE;
  const readyOutputFromEnv = env.CATS_READY_OUTPUT;
  const managedByFromEnv = env.CATS_MANAGED_BY;
  const normalizedModeFromEnv = isStartupMode(modeFromEnv ?? '')
    ? modeFromEnv as AppStartupMode
    : undefined;
  const normalizedReadyOutputFromEnv = isReadyOutput(readyOutputFromEnv ?? '')
    ? readyOutputFromEnv as AppReadyOutput
    : undefined;
  const mode = options.startupMode ?? normalizedModeFromEnv ?? 'standalone';
  const readyOutput = options.readyOutput
    ?? normalizedReadyOutputFromEnv
    ?? (mode === 'app-managed' ? 'json' : 'plain');

  return createAppStartupState({
    mode,
    managedBy: options.managedBy ?? managedByFromEnv,
    readyOutput,
  });
}

export function getAppReadinessSnapshot(
  startup: AppStartupState,
): AppReadinessSnapshot {
  return {
    endpoint: startup.readinessPath,
    authoritative: true,
    readySignal: startup.readySignal,
    phase: startup.phase,
    ready: startup.ready && startup.phase === 'ready',
  };
}

export function getAppLifecycleContract(
  startup: Pick<AppStartupState, 'contractVersion' | 'readinessPath'>,
) {
  return {
    startup: startup.contractVersion,
    supportedModes: [...APP_STARTUP_MODES],
    readinessPath: startup.readinessPath,
    lifecycleEvents: [...APP_LIFECYCLE_EVENTS],
    shutdownSignals: [...APP_SHUTDOWN_SIGNALS],
    shutdownReasons: [...APP_SHUTDOWN_REASONS],
  };
}

export function isAppManagedStdinShutdownEnabled(
  startup: Pick<AppStartupState, 'mode'>,
): boolean {
  return startup.mode === 'app-managed';
}

export function getAppShutdownContract(
  startup: Pick<AppStartupState, 'mode'>,
) {
  return {
    signals: [...APP_SHUTDOWN_SIGNALS],
    reasons: [...APP_SHUTDOWN_REASONS],
    stdinCloseEnabled: isAppManagedStdinShutdownEnabled(startup),
  };
}

export function getAppOperationalStatus(
  startup: AppStartupState,
): AppOperationalStatus {
  switch (startup.phase) {
    case 'ready':
      return {
        status: 'ok',
        summary: 'Cats app server is ready to accept requests.',
      };
    case 'starting':
      return {
        status: 'degraded',
        summary: 'Cats app server is starting and is not ready yet.',
      };
    case 'stopping':
      return {
        status: 'degraded',
        summary: `Cats app server is stopping${startup.shutdownReason ? ` (${startup.shutdownReason})` : ''}.`,
      };
    case 'stopped':
    default:
      return {
        status: 'unavailable',
        summary: `Cats app server is stopped${startup.shutdownReason ? ` (${startup.shutdownReason})` : ''}.`,
      };
  }
}

export function markAppReady(
  startup: AppStartupState,
  address: AppListeningAddress,
): AppStartupState {
  startup.phase = 'ready';
  startup.ready = true;
  startup.address = address;
  return startup;
}

export function markAppStopping(
  startup: AppStartupState,
  reason?: AppShutdownReason,
): AppStartupState {
  startup.phase = 'stopping';
  startup.ready = false;
  if (reason) {
    startup.shutdownReason = reason;
  }
  return startup;
}

export function markAppStopped(
  startup: AppStartupState,
  reason?: AppShutdownReason,
): AppStartupState {
  startup.phase = 'stopped';
  startup.ready = false;
  if (reason) {
    startup.shutdownReason = reason;
  }
  return startup;
}

function buildLifecycleEventPayload(
  startup: AppStartupState,
  event: AppLifecycleEventName,
  details: {
    address?: AppListeningAddress;
    error?: string;
    reason?: AppShutdownReason;
  } = {},
): AppLifecycleEventPayload {
  startup.lastEvent = event;
  const address = details.address ?? startup.address;
  const readiness = getAppReadinessSnapshot(startup);

  return {
    event,
    service: APP_SERVICE_NAME,
    contractVersion: startup.contractVersion,
    version: startup.version,
    pid: startup.pid,
    mode: startup.mode,
    managedBy: startup.managedBy,
    startedAt: startup.startedAt,
    timestamp: new Date().toISOString(),
    phase: startup.phase,
    readySignal: startup.readySignal,
    readinessPath: startup.readinessPath,
    ready: readiness.ready,
    host: address?.host,
    port: address?.port,
    healthUrl: address?.healthUrl,
    reason: details.reason ?? startup.shutdownReason,
    error: details.error,
  };
}

export function formatAppLifecycleEvent(
  startup: AppStartupState,
  event: AppLifecycleEventName,
  details: {
    address?: AppListeningAddress;
    error?: string;
    reason?: AppShutdownReason;
  } = {},
): string | null {
  if (startup.readyOutput === 'silent' && event !== 'app.startup_error') {
    startup.lastEvent = event;
    return null;
  }

  const payload = buildLifecycleEventPayload(startup, event, details);
  if (startup.readyOutput === 'json') {
    return `${JSON.stringify(payload)}\n`;
  }

  switch (event) {
    case 'app.ready':
      return `cats listening on http://${payload.host}:${payload.port}\n`;
    case 'app.stopping':
      return `cats stopping (${payload.reason || 'shutdown'})\n`;
    case 'app.stopped':
      return `cats stopped (${payload.reason || 'shutdown'})\n`;
    case 'app.startup_error':
      return `${payload.error || 'Unknown startup error'}\n`;
    default:
      return null;
  }
}

export function formatAppReadyMessage(
  startup: AppStartupState,
  address: AppListeningAddress,
): string | null {
  return formatAppLifecycleEvent(startup, 'app.ready', { address });
}

export function formatAppStoppingMessage(
  startup: AppStartupState,
  reason: AppShutdownReason,
): string | null {
  return formatAppLifecycleEvent(startup, 'app.stopping', { reason });
}

export function formatAppStoppedMessage(
  startup: AppStartupState,
  reason: AppShutdownReason,
): string | null {
  return formatAppLifecycleEvent(startup, 'app.stopped', { reason });
}

export function formatAppStartupError(
  startup: AppStartupState,
  error: unknown,
): string {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  return formatAppLifecycleEvent(startup, 'app.startup_error', {
    error: message,
  }) || `${message}\n`;
}

export function getAppHelpText(): string {
  return [
    'Usage: cats [options]',
    '',
    'Options:',
    '  --startup-mode <standalone|app-managed>',
    '  --managed-by <name>',
    '  --ready-output <plain|json|silent>',
    '  -h, --help',
  ].join('\n');
}
