import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import type { DesktopGoogleAuthStartInput, DesktopGoogleAuthStatus } from '../../../shared/nativeGoogleAuth.js';

/** Renderer sees bounded status and transaction ids, never provider/proof tokens. */
export function useDesktopGoogleAuth() {
  const bridge = resolveDesktopHostBridge()?.googleAuth;
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<DesktopGoogleAuthStatus | null>(null);
  const current = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    void bridge?.availability().then((status) => {
      if (active) setAvailable(status.available);
    }).catch(() => { if (active) setAvailable(false); });
    return () => {
      active = false;
      ++generation.current;
      void bridge?.cancel(current.current ?? undefined).catch(() => {});
    };
  }, [bridge]);

  const cancel = useCallback(async () => {
    const id = current.current;
    const result = await bridge?.cancel(id ?? undefined);
    if (result?.committing) { setSnapshot(result); return; }
    ++generation.current;
    current.current = null;
    setBusy(false);
    setSnapshot(null);
  }, [bridge]);

  const begin = useCallback(async (input: DesktopGoogleAuthStartInput): Promise<string> => {
    if (!bridge) throw new Error('not_configured');
    const attempt = ++generation.current;
    current.current = null;
    setBusy(true);
    setSnapshot(null);
    try {
      let result = await bridge.start(input);
      current.current = result.transactionId;
      for (;;) {
        if (attempt !== generation.current) {
          await bridge.cancel(result.transactionId);
          throw new Error('cancelled');
        }
        setSnapshot(result);
        if (result.phase === 'verified') return result.transactionId;
        if (result.phase !== 'waiting') throw new Error(result.error ?? 'cancelled');
        await new Promise((resolve) => setTimeout(resolve, 350));
        result = await bridge.status(result.transactionId);
      }
    } finally { if (attempt === generation.current) setBusy(false); }
  }, [bridge]);

  const submit = useCallback(async (input: Parameters<NonNullable<typeof bridge>['submit']>[0]) => {
    if (!bridge) throw new Error('not_configured');
    try { return await bridge.submit(input); }
    finally { current.current = null; setSnapshot(null); }
  }, [bridge]);
  return { supported: Boolean(bridge), available, busy, snapshot, begin, cancel, submit };
}
