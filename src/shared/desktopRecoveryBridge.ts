/**
 * Desktop recovery bridge.
 *
 * Provides a thin renderer-side interface for querying desktop host
 * setup state and triggering packaged-setup recovery actions.
 * Gracefully degrades when the desktop host bridge is unavailable
 * (e.g. non-desktop environments).
 */

import type { VoiceCaptureBridge } from './voiceCaptureBridge.js';

interface DesktopSetupResumeAction {
  helperId: string;
  reason: string;
  summary: string;
}

export type RuntimeLifecycleHelperMode =
  | 'check'
  | 'apply'
  | 'upgrade'
  | 'force'
  | 'uninstall';

export interface RuntimeLifecycleHelperSummary {
  id: string;
  label: string;
  kind: 'prerequisite_helper' | 'cli_pack_installer' | 'provider_installer' | 'readiness_helper';
  pack: 'native_cli_pack' | 'local_model_pack' | 'wsl_power_user_pack' | null;
  platform: 'windows' | 'windows_wsl' | 'macos' | 'linux';
  packagedRelativePath: string;
  supportsCheckOnly: boolean;
  supportsApply: boolean;
  supportsUpgrade: boolean;
  supportsForce: boolean;
  supportsUninstall: boolean;
  requiresElevation: boolean;
  available: boolean;
  supported: boolean;
  unsupportedReason: string | null;
}

export interface RuntimeLifecycleLastAction {
  helperId: string;
  mode: RuntimeLifecycleHelperMode;
  runState: 'completed' | 'failed';
  status: string | null;
  summary: string;
  plannedActions: string[];
  appliedChanges: string[];
  warnings: string[];
  manualSteps: string[];
  startedAt: string;
  completedAt: string | null;
}

export interface DesktopSetupSnapshot {
  helpers?: RuntimeLifecycleHelperSummary[];
  resumeAction: DesktopSetupResumeAction | null;
  state?: {
    updatedAt: string | null;
    lastAction: RuntimeLifecycleLastAction | null;
  };
}

interface DesktopBootstrapSnapshot {
  phase: string;
  status: string;
  summary: string;
}

export interface DesktopMobilePairingEnvUpdateResult {
  envPath: string;
  restartRequired: true;
  values: {
    CATS_DESKTOP_MOBILE_PAIRING_ENABLED: 'true';
    CATS_DESKTOP_APP_HOST: '0.0.0.0';
  };
}

export const DESKTOP_SCREENSHOT_CANCEL_REASONS = [
  'user_cancel',
  'too_small',
  'unknown_display',
] as const;

export type DesktopScreenshotCancelReason = typeof DESKTOP_SCREENSHOT_CANCEL_REASONS[number];

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

export type DesktopDistributionMode =
  | 'official_packaged'
  | 'preview_packaged'
  | 'development'
  | 'unofficial_packaged';

export type DesktopUpdateStatus =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'update_available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'failed';

export type DesktopUpdateNextAction = 'none' | 'check' | 'download' | 'restart_install';

export type DesktopUpdateErrorCode =
  | 'offline'
  | 'timeout'
  | 'provider_rejected'
  | 'metadata_invalid'
  | 'checksum_mismatch'
  | 'signature_rejected'
  | 'unsupported_package'
  | 'download_cancelled'
  | 'install_handoff_failed'
  | 'unknown';

export interface DesktopUpdateCapability {
  distribution: DesktopDistributionMode;
  provider: 'github_release' | 'none';
  channel: 'stable' | 'beta' | 'alpha';
  currentVersion: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  unavailableReason: string | null;
}

export interface DesktopUpdateProgress {
  percent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export interface DesktopUpdateSnapshot {
  capability: DesktopUpdateCapability;
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion: string | null;
  releaseSummary: string | null;
  lastCheckedAt: string | null;
  progress: DesktopUpdateProgress | null;
  error: { code: DesktopUpdateErrorCode; summary: string } | null;
  nextAction: DesktopUpdateNextAction;
}

export interface DesktopHostBridge {
  getSetupSnapshot?: () => Promise<DesktopSetupSnapshot>;
  runAction?: (actionId: string) => Promise<DesktopBootstrapSnapshot>;
  runSetupHelper?: (
    helperId: string,
    mode: RuntimeLifecycleHelperMode,
    options?: { dryRun?: boolean },
  ) => Promise<DesktopSetupSnapshot>;
  resumeSetup?: () => Promise<DesktopSetupSnapshot>;
  openBrowserHandoff?: (launchPath: string) => Promise<void>;
  screenshotRegionCaptureAvailable?: boolean;
  captureScreenshotRegion?: () => Promise<DesktopScreenshotCaptureResult>;
  enableMobilePairing?: () => Promise<DesktopMobilePairingEnvUpdateResult>;
  startVoiceCapture?: VoiceCaptureBridge['startVoiceCapture'];
  stopVoiceCapture?: VoiceCaptureBridge['stopVoiceCapture'];
  cancelVoiceCapture?: VoiceCaptureBridge['cancelVoiceCapture'];
  onVoiceCaptureEvent?: VoiceCaptureBridge['onVoiceCaptureEvent'];
  // Update commands take no arguments: the renderer asks the host to act and
  // never chooses a feed, URL, path, or installer flag.
  getUpdateSnapshot?: () => Promise<DesktopUpdateSnapshot>;
  checkForUpdates?: () => Promise<DesktopUpdateSnapshot>;
  downloadUpdate?: () => Promise<DesktopUpdateSnapshot>;
  restartAndInstall?: () => Promise<void>;
  onUpdateSnapshot?: (
    listener: (snapshot: DesktopUpdateSnapshot) => void,
  ) => () => void;
}

/**
 * Update controls render only when the host says so. Bridge presence alone is
 * not evidence: the bridge also exists in Electron development runs and in
 * unofficial packages.
 */
export function canRenderDesktopUpdateControls(
  snapshot: DesktopUpdateSnapshot | null,
): boolean {
  return snapshot?.capability.canCheck === true;
}

export async function getDesktopUpdateSnapshot(): Promise<DesktopUpdateSnapshot | null> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.getUpdateSnapshot) {
    return null;
  }

  try {
    return await bridge.getUpdateSnapshot();
  } catch {
    return null;
  }
}

export function resolveDesktopHostBridge(): DesktopHostBridge | null {
  const candidate = (
    globalThis as typeof globalThis & {
      catsDesktopHost?: DesktopHostBridge;
    }
  ).catsDesktopHost;
  return candidate ?? null;
}

export function isDesktopEnvironment(): boolean {
  return resolveDesktopHostBridge() !== null;
}

export interface DesktopSetupRecommendation {
  available: true;
  reason: string;
  summary: string;
}

export type DesktopRecoveryResult =
  | { available: false }
  | DesktopSetupRecommendation;

export async function getDesktopSetupRecommendation(): Promise<DesktopRecoveryResult> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.getSetupSnapshot) {
    return { available: false };
  }

  try {
    const snapshot = await bridge.getSetupSnapshot();
    if (snapshot.resumeAction) {
      return {
        available: true,
        reason: snapshot.resumeAction.reason,
        summary: snapshot.resumeAction.summary,
      };
    }
  } catch {
    // Bridge call failed — treat as unavailable.
  }

  return { available: false };
}

export async function triggerDesktopPackagedSetup(): Promise<boolean> {
  const bridge = resolveDesktopHostBridge();

  if (bridge?.resumeSetup) {
    try {
      await bridge.resumeSetup();
      return true;
    } catch {
      // Fall through to runAction.
    }
  }

  if (bridge?.runAction) {
    try {
      await bridge.runAction('resume_setup');
      return true;
    } catch {
      // Both paths failed.
    }
  }

  return false;
}
