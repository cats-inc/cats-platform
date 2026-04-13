type WaiterResolve = () => void;

const channelSignalVersions = new Map<string, number>();
const channelWaiters = new Map<string, Set<WaiterResolve>>();

export function readStreamTargetSignalVersion(channelId: string): number {
  return channelSignalVersions.get(channelId) ?? 0;
}

export function notifyStreamTargetChanged(channelId: string): void {
  channelSignalVersions.set(channelId, readStreamTargetSignalVersion(channelId) + 1);
  const waiters = channelWaiters.get(channelId);
  if (!waiters || waiters.size === 0) {
    return;
  }

  channelWaiters.delete(channelId);
  for (const resolve of waiters) {
    resolve();
  }
}

export function awaitNextStreamTarget(
  channelId: string,
  observedVersion: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  if (readStreamTargetSignalVersion(channelId) !== observedVersion) {
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

      const waiters = channelWaiters.get(channelId);
      if (waiters) {
        waiters.delete(onNotify);
        if (waiters.size === 0) {
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

    let waiters = channelWaiters.get(channelId);
    if (!waiters) {
      waiters = new Set<WaiterResolve>();
      channelWaiters.set(channelId, waiters);
    }
    waiters.add(onNotify);

    if (readStreamTargetSignalVersion(channelId) !== observedVersion) {
      settle();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
