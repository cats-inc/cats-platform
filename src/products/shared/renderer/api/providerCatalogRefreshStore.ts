import {
  refreshProviderModelCatalogs,
  type RefreshProviderCatalogsResult,
} from './providers.js';

export {
  readProviderCatalogRefreshFailedStatus,
} from './providers.js';

type StateListener = () => void;

export type ProviderCatalogRefreshResult =
  | { type: 'success'; value: RefreshProviderCatalogsResult }
  | { type: 'error'; error: unknown };

export type ProviderCatalogRefreshResultListener = (
  result: ProviderCatalogRefreshResult,
) => void;

export interface ProviderCatalogRefreshSnapshot {
  inflight: boolean;
}

let snapshot: ProviderCatalogRefreshSnapshot = { inflight: false };
const stateListeners = new Set<StateListener>();
const resultListeners = new Set<ProviderCatalogRefreshResultListener>();
let inflightPromise: Promise<RefreshProviderCatalogsResult> | null = null;

function publish(next: ProviderCatalogRefreshSnapshot): void {
  snapshot = next;
  for (const listener of stateListeners) {
    listener();
  }
}

function emitResult(result: ProviderCatalogRefreshResult): void {
  for (const listener of resultListeners) {
    listener(result);
  }
}

export function subscribeProviderCatalogRefresh(listener: StateListener): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

export function subscribeProviderCatalogRefreshResult(
  listener: ProviderCatalogRefreshResultListener,
): () => void {
  resultListeners.add(listener);
  return () => {
    resultListeners.delete(listener);
  };
}

export function getProviderCatalogRefreshSnapshot(): ProviderCatalogRefreshSnapshot {
  return snapshot;
}

export function triggerProviderCatalogRefresh(): Promise<RefreshProviderCatalogsResult> {
  if (inflightPromise) {
    return inflightPromise;
  }

  publish({ inflight: true });
  const promise = refreshProviderModelCatalogs()
    .then(
      (value) => {
        emitResult({ type: 'success', value });
        return value;
      },
      (error) => {
        emitResult({ type: 'error', error });
        throw error;
      },
    )
    .finally(() => {
      inflightPromise = null;
      publish({ inflight: false });
    });
  inflightPromise = promise;
  return promise;
}
