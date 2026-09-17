const listeners = new Set<() => void>();

export class ProviderClientAuthError extends Error {}

/** Module caches subscribe once; an auth/connection reset also cancels inflight writes. */
export function onProviderClientInvalidation(listener: () => void): void {
  listeners.add(listener);
}

export function invalidateProviderClientSession(): void {
  for (const listener of listeners) listener();
}
