import { ToastContainer, useToast } from '../../../design/components/Toast.js';
import type { AppShellPayload } from '../../../products/shared/api/workspaceContracts.js';
import { PlatformSettingsDesktopMobilePairing } from './PlatformSettingsDesktopMobilePairing.js';
import { PlatformSettingsDesktopStartupBehavior } from './PlatformSettingsDesktopStartupBehavior.js';
import { PlatformSettingsDesktopUpdates } from './PlatformSettingsDesktopUpdates.js';

export interface PlatformSettingsDesktopProps {
  payload: AppShellPayload;
  onPayloadUpdate: (payload: AppShellPayload) => void;
}

/**
 * The `Settings > Desktop` route.
 *
 * It owns only composition and the toast surface. Each section owns its own
 * state and its own host calls, so this file does not grow a concern every time
 * a section is added — which is how the previous single component ended up
 * holding updates, pairing, and startup preferences at once.
 *
 * One `ToastContainer` lives here because the sections share a single feedback
 * channel; AGENTS.md rules out ad hoc inline success/error text in Settings.
 */
export function PlatformSettingsDesktop({
  payload,
  onPayloadUpdate,
}: PlatformSettingsDesktopProps) {
  const { toasts, showToast } = useToast();

  return (
    <>
      {/* SPEC-111 section 4 fixes this order: App updates first, with the
          existing relative order of Mobile pairing before Startup behavior
          preserved. */}
      <PlatformSettingsDesktopUpdates showToast={showToast} />
      <PlatformSettingsDesktopMobilePairing
        payload={payload}
        showToast={showToast}
      />
      <PlatformSettingsDesktopStartupBehavior
        payload={payload}
        onPayloadUpdate={onPayloadUpdate}
        showToast={showToast}
      />

      <ToastContainer toasts={toasts} />
    </>
  );
}
