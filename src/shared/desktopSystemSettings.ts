import { resolveDesktopHostBridge } from './desktopRecoveryBridge.js';

/**
 * The System Settings panes the Desktop host may open for the owner (ADR-147).
 * The renderer names a pane; only the host knows its URL, so a page can never
 * open an arbitrary settings URL.
 */
export const DESKTOP_SYSTEM_SETTINGS_PANES = [
  'microphone',
  'speech_recognition',
  'screen_recording',
  'login_items',
] as const;

export type DesktopSystemSettingsPane = typeof DESKTOP_SYSTEM_SETTINGS_PANES[number];

const PANE_SET = new Set<string>(DESKTOP_SYSTEM_SETTINGS_PANES);

export function isDesktopSystemSettingsPane(value: unknown): value is DesktopSystemSettingsPane {
  return typeof value === 'string' && PANE_SET.has(value);
}

/** True only where the host offers the panes (macOS Desktop), never by platform sniffing. */
export function canOpenDesktopSystemSettings(): boolean {
  const bridge = resolveDesktopHostBridge();
  return bridge?.systemSettingsAvailable === true && typeof bridge.openSystemSettings === 'function';
}

/** Opens a pane; a failure is ignored, since the owner can still open System Settings themselves. */
export async function openDesktopSystemSettings(pane: DesktopSystemSettingsPane): Promise<void> {
  const bridge = resolveDesktopHostBridge();
  if (bridge?.systemSettingsAvailable !== true || !bridge.openSystemSettings) {
    return;
  }
  try {
    await bridge.openSystemSettings(pane);
  } catch {
    // Nothing to recover: the message already names the pane.
  }
}

/** macOS registered the login item but wants the owner's approval in Login Items. */
export async function desktopLoginItemNeedsApproval(): Promise<boolean> {
  const bridge = resolveDesktopHostBridge();
  if (!bridge?.loginItemNeedsApproval) {
    return false;
  }
  try {
    return await bridge.loginItemNeedsApproval() === true;
  } catch {
    return false;
  }
}
