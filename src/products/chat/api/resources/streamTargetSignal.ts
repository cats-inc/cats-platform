const SAFETY_TIMEOUT_MS = 60_000;

type WaiterResolve = () => void;

const channelWaiters = new Map<string, WaiterResolve[]>();

export function notifyStreamTargetChanged(channelId: string): void {
  const waiters = channelWaiters.get(channelId);
  if (!waiters || waiters.length === 0) {
    return;
  }

  channelWaiters.delete(channelId);
  for (const resolve of waiters) {
    resolve();
  }
}

export function awaitNextStreamTarget(
  channelId: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let settled = false;

    function settle(): void {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      clearTimeout(safetyTimer);

      const waiters = channelWaiters.get(channelId);
      if (waiters) {
        const index = waiters.indexOf(onNotify);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        if (waiters.length === 0) {
          channelWaiters.delete(channelId);
        }
      }

      resolve();
    }

    function onNotify(): void {
      settle();
    }

    function onAbort(): void {
      settle();
    }

    const safetyTimer = setTimeout(settle, SAFETY_TIMEOUT_MS);

    if (!channelWaiters.has(channelId)) {
      channelWaiters.set(channelId, []);
    }
    channelWaiters.get(channelId)!.push(onNotify);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
