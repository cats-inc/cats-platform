export const DESKTOP_HOST_NAME = 'cats-electron-host';
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
  'resume_setup',
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
  'resume_setup',
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
export const DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS = [
  'claude_code',
  'cursor_agent',
  'opencode',
  'kilo',
  'kiro',
  'goose',
  'junie',
  'ollama',
] as const;
export const DESKTOP_PROVIDER_SETUP_DELIVERY_PHASES = [
  'initial_packaged_path',
  'later_packaged_path',
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
export const DESKTOP_SETUP_HELPER_MODES = [
  'check',
  'apply',
  'upgrade',
  'force',
  'uninstall',
] as const;
export const DESKTOP_SETUP_ACTION_RUN_STATES = [
  'completed',
  'failed',
] as const;
export const DESKTOP_SETUP_RESUME_REASONS = [
  'restart_required',
  'relaunch_required',
  'elevation_required',
  'changes_required',
  'not_installed',
  'retry_failed',
  'auth_required',
  'first_wsl_boot_required',
  'docker_warm_up_required',
  'manual_follow_up',
  'verification_recommended',
] as const;
export const DESKTOP_SETUP_INTERRUPTION_KINDS = [
  'restart_required',
  'relaunch_required',
  'elevation_required',
  'auth_required',
  'first_wsl_boot_required',
  'docker_warm_up_required',
] as const;
export const DESKTOP_SCREENSHOT_CAPTURE_SOURCES = [
  'composer',
] as const;
export const DESKTOP_VOICE_CAPTURE_START_CHANNEL = 'cats-host:voice-start';
export const DESKTOP_VOICE_CAPTURE_STOP_CHANNEL = 'cats-host:voice-stop';
export const DESKTOP_VOICE_CAPTURE_CANCEL_CHANNEL = 'cats-host:voice-cancel';
export const DESKTOP_VOICE_CAPTURE_EVENT_CHANNEL = 'cats-host:voice-event';
export const DESKTOP_SCREENSHOT_CAPTURE_OUTCOMES = [
  'ok',
  'cancelled',
  'permission_denied',
  'platform_unsupported',
  'error',
] as const;
export const DESKTOP_SCREENSHOT_CANCEL_REASONS = [
  'user_cancel',
  'too_small',
  'unknown_display',
] as const;
export const VOICE_CAPTURE_MODES = [
  'on-device',
  'cloud',
  'unknown',
] as const;
export const VOICE_CAPTURE_ERROR_REASONS = [
  'permission_denied',
  'permission_not_determined',
  'mic_unavailable',
  'language_not_supported',
  'engine_unavailable',
  'helper_crashed',
  'cancelled',
  // Reserved for helper/OS aborts where the user did not request cancellation.
  'aborted',
] as const;

export type DesktopBootstrapPhase = typeof DESKTOP_BOOTSTRAP_PHASES[number];
export type DesktopHostActionId = typeof DESKTOP_HOST_ACTION_IDS[number];
export type DesktopHealthStatus = 'ok' | 'degraded' | 'unavailable';
export type DesktopBootstrapEventStatus = DesktopHealthStatus | 'info';
export type ManagedServiceName = 'cats-runtime' | 'cats-platform';
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
export type DesktopProviderSetupLocalProviderId =
  typeof DESKTOP_PROVIDER_SETUP_LOCAL_PROVIDERS[number];
export type DesktopProviderSetupDeliveryPhase =
  typeof DESKTOP_PROVIDER_SETUP_DELIVERY_PHASES[number];
export type DesktopProviderSetupAssetStatus = typeof DESKTOP_PROVIDER_SETUP_ASSET_STATUSES[number];
export type DesktopProviderSetupAssetKind = typeof DESKTOP_PROVIDER_SETUP_ASSET_KINDS[number];
export type DesktopProviderSetupPlatform = typeof DESKTOP_PROVIDER_SETUP_PLATFORMS[number];
export type DesktopSetupHelperMode = typeof DESKTOP_SETUP_HELPER_MODES[number];
export type DesktopSetupActionRunState = typeof DESKTOP_SETUP_ACTION_RUN_STATES[number];
export type DesktopSetupResumeReason = typeof DESKTOP_SETUP_RESUME_REASONS[number];
export type DesktopSetupInterruptionKind = typeof DESKTOP_SETUP_INTERRUPTION_KINDS[number];
export type DesktopScreenshotCaptureSource = typeof DESKTOP_SCREENSHOT_CAPTURE_SOURCES[number];
export type DesktopScreenshotCaptureOutcome = typeof DESKTOP_SCREENSHOT_CAPTURE_OUTCOMES[number];
export type DesktopScreenshotCancelReason = typeof DESKTOP_SCREENSHOT_CANCEL_REASONS[number];
export type VoiceCaptureSessionId = string;
export type VoiceCaptureMode = typeof VOICE_CAPTURE_MODES[number];
export type VoiceCaptureErrorReason = typeof VOICE_CAPTURE_ERROR_REASONS[number];

export interface DesktopScreenshotCaptureRequest {
  source: DesktopScreenshotCaptureSource;
}

export type DesktopScreenshotCaptureResult =
  | {
      outcome: 'ok';
      png: Uint8Array;
      mime: 'image/png';
      filename: string;
      width: number;
      height: number;
    }
  | {
      outcome: 'cancelled';
      reason: DesktopScreenshotCancelReason;
    }
  | {
      outcome: 'permission_denied' | 'platform_unsupported' | 'error';
      message?: string;
    };

export interface VoiceCaptureStartOptions {
  sessionId: VoiceCaptureSessionId;
  locale?: string;
}

export type VoiceCaptureEvent =
  | {
      type: 'ready';
      sessionId: VoiceCaptureSessionId;
      locale: string;
      mode: VoiceCaptureMode;
    }
  | {
      type: 'partial';
      sessionId: VoiceCaptureSessionId;
      text: string;
    }
  | {
      type: 'final';
      sessionId: VoiceCaptureSessionId;
      text: string;
    }
  | {
      type: 'error';
      sessionId: VoiceCaptureSessionId;
      reason: VoiceCaptureErrorReason;
    }
  | {
      type: 'end';
      sessionId: VoiceCaptureSessionId;
    };

export interface DesktopBootstrapEventReference {
  artifactId?: string;
  artifactPath?: string;
  recordId?: string;
  route?: string;
}

export interface DesktopBootstrapEventError {
  message: string;
  code?: string;
  cause?: string;
  stack?: string;
}

export interface DesktopBootstrapEvent {
  layer: 'runtime' | 'product' | 'host';
  kind: string;
  timestamp: string;
  attemptId: string | null;
  summary: string;
  status: DesktopBootstrapEventStatus;
  context: Record<string, unknown> | null;
  error: DesktopBootstrapEventError | null;
  reference: DesktopBootstrapEventReference | null;
}

export interface DesktopBootstrapLayerSummary {
  status: DesktopBootstrapEventStatus;
  summary: string;
  latestTimestamp: string | null;
  latestReference: DesktopBootstrapEventReference | null;
}

export interface DesktopBootstrapAggregationBundle {
  generatedAt: string;
  attemptId: string | null;
  layers: {
    runtime: DesktopBootstrapLayerSummary;
    product: DesktopBootstrapLayerSummary;
    host: DesktopBootstrapLayerSummary;
  };
  chronology: DesktopBootstrapEvent[];
}

export interface DesktopManagedServiceLog {
  service: ManagedServiceName;
  logPath: string | null;
  lastOutput: string | null;
  lastOutputAt: string | null;
}

export interface DesktopProductBootstrapDiagnostics {
  generatedAt: string;
  attemptId: string | null;
  status: DesktopBootstrapEventStatus;
  summary: string;
  historyPath: string | null;
  latestReference: DesktopBootstrapEventReference | null;
  events: DesktopBootstrapEvent[];
}

export interface DesktopHostDiagnosticsState {
  activeAttemptId: string | null;
  hostEvents: DesktopBootstrapEvent[];
  runtimeEvents: DesktopBootstrapEvent[];
  product: DesktopProductBootstrapDiagnostics | null;
  aggregation: DesktopBootstrapAggregationBundle | null;
  serviceLogs: DesktopManagedServiceLog[];
  updatedAt: string | null;
}

export interface ManagedServiceSnapshot {
  name: ManagedServiceName;
  status: ManagedServiceStatus;
  ready: boolean;
  pid: number | null;
  startedAt: string | null;
  healthUrl: string;
  error: string | null;
  exitCode: number | null;
  logPath: string | null;
  lastOutput: string | null;
  lastOutputAt: string | null;
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
  sha256: string | null;
  error: string | null;
}

export interface DesktopPackagingArtifact {
  id: string;
  relativePath: string;
  role: 'electron_host' | 'app_server' | 'app_renderer' | 'runtime_sidecar' | 'manifest' | 'setup_asset';
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

export type DesktopSidecarLayout = 'split' | 'bundle';

export interface DesktopSidecarLayoutSelection {
  app: DesktopSidecarLayout;
  runtime: DesktopSidecarLayout;
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
    localProviders: Array<{
      id: DesktopProviderSetupLocalProviderId;
      label: string;
      pack: DesktopProviderSetupPackId;
      platform: DesktopProviderSetupPlatform;
      deliveryPhase: DesktopProviderSetupDeliveryPhase;
      bundledInCurrentInstaller: boolean;
      helperIds: string[];
      currentHome: string;
      targetHome: string;
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
    helperCatalog: Array<{
      id: string;
      assetId: string;
      label: string;
      kind: DesktopProviderSetupAssetKind;
      pack: DesktopProviderSetupPackId | null;
      platform: DesktopProviderSetupPlatform;
      packagedRelativePath: string;
      supportsCheckOnly: boolean;
      supportsApply: boolean;
      supportsUpgrade: boolean;
      supportsForce: boolean;
      supportsUninstall: boolean;
      requiresElevation: boolean;
      resumable: boolean;
      notes: string[];
    }>;
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
  sidecarLayout: DesktopSidecarLayoutSelection;
  selfHostedNpmCompatible: boolean;
  targets: DesktopPackagingTarget[];
  installer: DesktopInstallerContract;
  updates: DesktopUpdateContract;
}

export interface DesktopSetupHelperSummary {
  id: string;
  assetId: string;
  label: string;
  kind: DesktopProviderSetupAssetKind;
  pack: DesktopProviderSetupPackId | null;
  platform: DesktopProviderSetupPlatform;
  packagedRelativePath: string;
  supportsCheckOnly: boolean;
  supportsApply: boolean;
  supportsUpgrade: boolean;
  supportsForce: boolean;
  supportsUninstall: boolean;
  requiresElevation: boolean;
  resumable: boolean;
  notes: string[];
  available: boolean;
  supported: boolean;
  unsupportedReason: string | null;
}

export interface DesktopSetupActionRecord {
  helperId: string;
  assetId: string;
  label: string;
  pack: DesktopProviderSetupPackId | null;
  mode: DesktopSetupHelperMode;
  runState: DesktopSetupActionRunState;
  status: string | null;
  summary: string;
  packagedRelativePath: string;
  scriptPath: string | null;
  requiresElevation: boolean;
  resumable: boolean;
  restartRequired: boolean;
  startedAt: string;
  completedAt: string | null;
  warnings: string[];
  plannedActions: string[];
  appliedChanges: string[];
  optionalFollowThroughPack: DesktopProviderSetupPackId | null;
  manualSteps: string[];
  interruptions: DesktopSetupInterruption[];
  error: string | null;
}

export interface DesktopSetupInterruption {
  kind: DesktopSetupInterruptionKind;
  summary: string;
  resumable: boolean;
  requiresRestart: boolean;
  requiresElevation: boolean;
}

export interface DesktopSetupResumeAction {
  helperId: string;
  label: string;
  mode: DesktopSetupHelperMode;
  reason: DesktopSetupResumeReason;
  summary: string;
  manualSteps: string[];
  interruptions: DesktopSetupInterruption[];
  requiresElevation: boolean;
  restartRequired: boolean;
}

export interface DesktopSetupState {
  lastAction: DesktopSetupActionRecord | null;
  updatedAt: string | null;
}

export interface DesktopSetupSnapshot {
  helpers: DesktopSetupHelperSummary[];
  state: DesktopSetupState;
  resumeAction: DesktopSetupResumeAction | null;
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
  setup: DesktopSetupState;
  diagnostics: DesktopHostDiagnosticsState | null;
  hostStatePath: string | null;
}

export interface DesktopHostPersistedState {
  snapshot: DesktopBootstrapSnapshot;
  background: DesktopBackgroundState;
  updates: DesktopUpdateState;
  packaging: DesktopPackagingPlan;
  setup: DesktopSetupState;
  diagnostics: DesktopHostDiagnosticsState | null;
  savedAt: string;
}
