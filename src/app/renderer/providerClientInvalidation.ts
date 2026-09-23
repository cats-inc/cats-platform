const listeners = new Set<() => void>();
let generation = 0;
export function getProviderClientGeneration(): number { return generation; }

export class ProviderClientAuthError extends Error {}

/** Module caches subscribe once; an auth/connection reset also cancels inflight writes. */
export function onProviderClientInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function invalidateProviderClientSession(): void {
  generation += 1;
  for (const listener of listeners) listener();
}
