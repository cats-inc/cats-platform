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
export const DESKTOP_BACKGROUND_MODES = [
  'foreground',
  'background',
] as const;
export const DESKTOP_BACKGROUND_CLOSE_BEHAVIORS = [
  'quit',
  'minimize_to_tray',
] as const;
export const DESKTOP_PROGRESS_STEP_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
] as const;
export const DESKTOP_UPDATE_STATUSES = [
  'disabled',
  'idle',
  'checking',
  'up_to_date',
  'update_available',
  'failed',
] as const;
export const DESKTOP_UPDATE_CHANNELS = [
  'stable',
  'beta',
  'alpha',
] as const;
export const DESKTOP_PACKAGING_PLATFORMS = [
  'windows',
  'macos',
  'linux',
] as const;
export const DESKTOP_PACKAGING_ARCHITECTURES = [
  'x64',
  'arm64',
  'universal',
] as const;
export const DESKTOP_INSTALLER_FORMATS = [
  'nsis',
  'msi',
  'zip',
  'dmg',
  'pkg',
  'appimage',
  'deb',
  'tar.gz',
] as const;
export const DESKTOP_REMEDIATION_KINDS = [
  'retry',
  'open_runtime_diagnostics',
  'open_setup',
  'reinstall_host',
  'manual_update',
  'restart_host',
] as const;
export const DESKTOP_PROVIDER_SETUP_MODES = [
  'api_baseline',
  'api_plus_local_cli',
  'local_cli_only',
] as const;
export const DESKTOP_PROVIDER_SETUP_PACKS = [
  'api_baseline',
  'native_cli_pack',
  'local_model_pack',
  'wsl_power_user_pack',
] as const;
export const DESKTOP_PROVIDER_SETUP_ASSET_STATUSES = [
  'ported',
  'planned',
  'deferred',
] as const;
export const DESKTOP_PROVIDER_SETUP_ASSET_KINDS = [
  'provider_metadata',
  'prerequisite_helper',
  'cli_pack_installer',
  'provider_installer',
  'readiness_helper',
] as const;
export const DESKTOP_PROVIDER_SETUP_PLATFORMS = [
  'cross_platform',
  'windows',
  'macos',
  'linux',
  'windows_wsl',
] as const;

export type DesktopBootstrapPhase = typeof DESKTOP_BOOTSTRAP_PHASES[number];
export type DesktopHostActionId = typeof DESKTOP_HOST_ACTION_IDS[number];
export type DesktopHealthStatus = 'ok' | 'degraded' | 'unavailable';
export type ManagedServiceName = 'cats-runtime' | 'cats';
export type ManagedServiceStatus = 'stopped' | 'starting' | 'ready' | 'failed';
export type DesktopBackgroundMode = typeof DESKTOP_BACKGROUND_MODES[number];
export type DesktopBackgroundCloseBehavior = typeof DESKTOP_BACKGROUND_CLOSE_BEHAVIORS[number];
export type DesktopProgressStepStatus = typeof DESKTOP_PROGRESS_STEP_STATUSES[number];
export type DesktopUpdateStatus = typeof DESKTOP_UPDATE_STATUSES[number];
export type DesktopUpdateChannel = typeof DESKTOP_UPDATE_CHANNELS[number];
export type DesktopPackagingPlatform = typeof DESKTOP_PACKAGING_PLATFORMS[number];
export type DesktopPackagingArchitecture = typeof DESKTOP_PACKAGING_ARCHITECTURES[number];
export type DesktopInstallerFormat = typeof DESKTOP_INSTALLER_FORMATS[number];
export type DesktopRemediationKind = typeof DESKTOP_REMEDIATION_KINDS[number];
export type DesktopProviderSetupMode = typeof DESKTOP_PROVIDER_SETUP_MODES[number];
export type DesktopProviderSetupPackId = typeof DESKTOP_PROVIDER_SETUP_PACKS[number];
export type DesktopProviderSetupAssetStatus = typeof DESKTOP_PROVIDER_SETUP_ASSET_STATUSES[number];
export type DesktopProviderSetupAssetKind = typeof DESKTOP_PROVIDER_SETUP_ASSET_KINDS[number];
export type DesktopProviderSetupPlatform = typeof DESKTOP_PROVIDER_SETUP_PLATFORMS[number];

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
  category?: 'service' | 'provider' | 'install' | 'update' | 'packaging';
  resumeKey?: string;
  remediation?: DesktopRemediationAction | null;
}

export interface DesktopHostAction {
  id: DesktopHostActionId;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}

export interface DesktopRemediationAction {
  kind: DesktopRemediationKind;
  label: string;
  resumable: boolean;
  requiresRestart: boolean;
  docsPath?: string | null;
}

export interface DesktopBootstrapProgressStep {
  id: string;
  label: string;
  status: DesktopProgressStepStatus;
  detail: string | null;
  blocking: boolean;
}

export interface DesktopBootstrapProgress {
  currentStepId: string | null;
  steps: DesktopBootstrapProgressStep[];
}

export interface DesktopBackgroundState {
  trayEnabled: boolean;
  keepServicesRunning: boolean;
  mode: DesktopBackgroundMode;
  closeBehavior: DesktopBackgroundCloseBehavior;
  windowVisible: boolean;
  lastHiddenAt: string | null;
}

export interface DesktopUpdateState {
  channel: DesktopUpdateChannel;
  status: DesktopUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  summary: string;
  lastCheckedAt: string | null;
  manifestUrl: string | null;
  downloadUrl: string | null;
  error: string | null;
}

export interface DesktopPackagingArtifact {
  id: string;
  relativePath: string;
  role: 'electron_host' | 'app_server' | 'app_renderer' | 'runtime_sidecar' | 'manifest';
  required: boolean;
}

export interface DesktopPackagingTarget {
  id: string;
  platform: DesktopPackagingPlatform;
  arch: DesktopPackagingArchitecture;
  installerFormats: DesktopInstallerFormat[];
  artifactBaseName: string;
  stageDirectory: string;
  artifacts: DesktopPackagingArtifact[];
}

export interface DesktopInstallerContract {
  prerequisiteChecks: Array<{
    id: string;
    label: string;
    hostOwned: boolean;
    resumable: boolean;
  }>;
  providerSetup: {
    baselineMode: DesktopProviderSetupMode;
    modes: Array<{
      id: DesktopProviderSetupMode;
      label: string;
      description: string;
      requiresLocalInstall: boolean;
    }>;
    capabilityPacks: Array<{
      id: DesktopProviderSetupPackId;
      label: string;
      recommended: boolean;
      requiresLocalInstall: boolean;
      notes: string[];
    }>;
    knowledgeSources: Array<{
      id: 'cats-runtime' | 'environment-bootstrap' | 'project-bootstrap';
      role: 'provider_metadata' | 'install_execution' | 'a2a_pilot';
      productDependency: boolean;
      notes: string[];
    }>;
    executionDefaults: {
      hostOwned: true;
      rendererShellAccess: false;
      nonInteractiveDefault: true;
      structuredResultsRequired: true;
    };
    prioritizedAssets: Array<{
      id: string;
      label: string;
      kind: DesktopProviderSetupAssetKind;
      status: DesktopProviderSetupAssetStatus;
      pack: DesktopProviderSetupPackId | null;
      platform: DesktopProviderSetupPlatform;
      currentHome: string;
      targetHome: string;
      notes: string[];
    }>;
  };
  remediationActions: DesktopRemediationAction[];
  requiresBundledRuntimeSidecar: boolean;
}

export interface DesktopUpdateContract {
  channel: DesktopUpdateChannel;
  autoCheckOnStartup: boolean;
  autoDownload: boolean;
  manifestUrl: string | null;
}

export interface DesktopPackagingPlan {
  strategy: 'electron-sidecar-bundle';
  generatedAt: string;
  outputRoot: string;
  selfHostedNpmCompatible: boolean;
  targets: DesktopPackagingTarget[];
  installer: DesktopInstallerContract;
  updates: DesktopUpdateContract;
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
  progress: DesktopBootstrapProgress;
  background: DesktopBackgroundState;
  updates: DesktopUpdateState;
  packaging: DesktopPackagingPlan;
  hostStatePath: string | null;
}

export interface DesktopHostPersistedState {
  snapshot: DesktopBootstrapSnapshot;
  background: DesktopBackgroundState;
  updates: DesktopUpdateState;
  packaging: DesktopPackagingPlan;
  savedAt: string;
}
