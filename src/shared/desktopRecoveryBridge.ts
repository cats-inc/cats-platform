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

interface DesktopSetupSnapshot {
  helpers?: RuntimeLifecycleHelperSummary[];
  resumeAction: DesktopSetupResumeAction | null;
  state?: {
    updatedAt: string | null;
    lastAction: null | {
      helperId: string;
      mode: RuntimeLifecycleHelperMode;
      runState: 'completed' | 'failed';
      status: string | null;
    };
  };
}

interface DesktopBootstrapSnapshot {
  phase: string;
  status: string;
  summary: string;
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

export interface DesktopHostBridge {
  getSetupSnapshot?: () => Promise<DesktopSetupSnapshot>;
  runAction?: (actionId: string) => Promise<DesktopBootstrapSnapshot>;
  runSetupHelper?: (
    helperId: string,
    mode: RuntimeLifecycleHelperMode,
  ) => Promise<DesktopSetupSnapshot>;
  resumeSetup?: () => Promise<DesktopSetupSnapshot>;
  screenshotRegionCaptureAvailable?: boolean;
  captureScreenshotRegion?: () => Promise<DesktopScreenshotCaptureResult>;
  startVoiceCapture?: VoiceCaptureBridge['startVoiceCapture'];
  stopVoiceCapture?: VoiceCaptureBridge['stopVoiceCapture'];
  cancelVoiceCapture?: VoiceCaptureBridge['cancelVoiceCapture'];
  onVoiceCaptureEvent?: VoiceCaptureBridge['onVoiceCaptureEvent'];
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
