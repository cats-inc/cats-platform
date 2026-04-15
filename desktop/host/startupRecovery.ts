import type {
  DesktopBootstrapPhase,
  ManagedServiceSnapshot,
} from './contracts.js';

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
