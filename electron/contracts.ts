import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface AppPackageJson {
  version?: string;
}

function readPackageVersion(): string {
  const packageJsonPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'package.json',
  );
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as AppPackageJson;
  if (!packageJson.version) {
    throw new Error(`Could not resolve version from ${packageJsonPath}`);
  }
  return packageJson.version;
}

export const DESKTOP_HOST_NAME = 'cats-electron-host';
export const DESKTOP_HOST_VERSION = readPackageVersion();
export const DESKTOP_BOOTSTRAP_PHASES = [
  'starting_services',
  'checking_prerequisites',
  'ready_for_setup',
  'ready_for_chat',
  'needs_prerequisites',
  'failed',
] as const;
export const DESKTOP_HOST_ACTION_IDS = [
  'retry',
  'open_runtime_diagnostics',
  'open_setup',
  'open_chat',
  'quit',
] as const;

export type DesktopBootstrapPhase = typeof DESKTOP_BOOTSTRAP_PHASES[number];
export type DesktopHostActionId = typeof DESKTOP_HOST_ACTION_IDS[number];
export type DesktopHealthStatus = 'ok' | 'degraded' | 'unavailable';
export type ManagedServiceName = 'cats-runtime' | 'cats';
export type ManagedServiceStatus = 'stopped' | 'starting' | 'ready' | 'failed';

export interface ManagedServiceSnapshot {
  name: ManagedServiceName;
  status: ManagedServiceStatus;
  ready: boolean;
  pid: number | null;
  startedAt: string | null;
  healthUrl: string;
  error: string | null;
  exitCode: number | null;
}

export interface DesktopProviderSummary {
  status: DesktopHealthStatus;
  summary: string;
  configuredProviders: number;
  targets: number;
  defaultTargets: number;
  ok: number;
  degraded: number;
  unavailable: number;
}

export interface DesktopProviderIssue {
  provider: string;
  backend: string;
  instance: string;
  target: string;
  defaultTarget: boolean;
  status: DesktopHealthStatus;
  summary: string;
  attentionCodes: string[];
}

export interface DesktopPrerequisiteIssue {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  target?: string;
}

export interface DesktopHostAction {
  id: DesktopHostActionId;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}

export interface DesktopBootstrapSnapshot {
  service: typeof DESKTOP_HOST_NAME;
  version: string;
  timestamp: string;
  phase: DesktopBootstrapPhase;
  status: DesktopHealthStatus;
  summary: string;
  services: ManagedServiceSnapshot[];
  runtime: {
    baseUrl: string;
    diagnosticsUrl: string;
    status: DesktopHealthStatus | null;
    summary: string | null;
    providerSummary: DesktopProviderSummary | null;
    issues: DesktopProviderIssue[];
  };
  app: {
    baseUrl: string;
    setupCompleteAt: string | null;
    entryPath: string;
    status: DesktopHealthStatus | null;
    summary: string | null;
  };
  issues: DesktopPrerequisiteIssue[];
  actions: DesktopHostAction[];
  lastError: string | null;
}
