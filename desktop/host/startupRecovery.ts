import type {
  DesktopBootstrapPhase,
  ManagedServiceSnapshot,
} from './contracts.js';

/** Retry prerequisite reads without restarting already-ready sidecars. */
export async function retryDesktopBootstrapChecks<T extends { phase: DesktopBootstrapPhase }>(
  check: () => Promise<T>,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 1_000)),
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const snapshot = await check();
      if (isDesktopBootstrapLoadingPhase(snapshot.phase)) {
        throw new Error(`Desktop startup checks did not finish (${snapshot.phase}).`);
      }
      return snapshot;
    } catch (error) {
      if (attempt === 3) throw error;
      await wait();
    }
  }
}

export function resolveDesktopBootstrapError(
  currentError: string | null,
  nextError?: string | null,
): string | null {
  return nextError === undefined ? currentError : nextError;
}

export function isDesktopBootstrapLoadingPhase(
  phase: DesktopBootstrapPhase,
): boolean {
  return phase === 'starting_services' || phase === 'checking_prerequisites';
}

export function shouldAttemptDesktopLateReadyRecovery(input: {
  lastError: string | null;
  services: ReadonlyArray<Pick<ManagedServiceSnapshot, 'ready'>>;
}): boolean {
  return Boolean(input.lastError)
    && input.services.length > 0
    && input.services.every((service) => service.ready);
}
