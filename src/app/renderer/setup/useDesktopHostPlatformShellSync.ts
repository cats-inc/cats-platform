import { useEffect } from 'react';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract.js';
import { syncDesktopHostPlatformShellState } from './desktopHostBridge.js';

/** Keep tray products current on normal loads, not only setup completion. */
export function useDesktopHostPlatformShellSync(envelope: PlatformHostEnvelope | null): void {
  const bootstrapAttemptId = envelope?.bootstrapAttemptId ?? null;
  const setupCompleteAt = envelope?.setupCompleteAt ?? null;
  const products = envelope?.products;

  useEffect(() => {
    if (!products) return;
    void syncDesktopHostPlatformShellState({
      bootstrapAttemptId,
      setupCompleteAt,
      products,
    }).catch(() => {
      // The window may outlive a host shutdown. A bridge failure must not
      // prevent product navigation; the next envelope refresh retries it.
    });
  }, [bootstrapAttemptId, setupCompleteAt, products]);
}
