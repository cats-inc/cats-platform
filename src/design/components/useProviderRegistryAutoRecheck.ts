import { useEffect } from 'react';

import type { ProductProviderRegistryState } from '../../shared/providerCatalog.js';
import {
  resolveProviderRegistryAutoRecheckDelayMs,
  shouldAutoRecheckProviderRegistry,
} from './providerModelFieldsSupport.js';

interface BrowserWindowLike {
  addEventListener: (event: 'focus', listener: () => void) => void;
  removeEventListener: (event: 'focus', listener: () => void) => void;
}

interface BrowserDocumentLike {
  visibilityState?: string;
  addEventListener: (event: 'visibilitychange', listener: () => void) => void;
  removeEventListener: (event: 'visibilitychange', listener: () => void) => void;
}

export function useProviderRegistryAutoRecheck(input: {
  providersLoaded: boolean;
  providerCount: number;
  registryState: ProductProviderRegistryState;
  retryable: boolean;
  providerRegistrySetupHref: string | null;
  lastAutoProviderRegistryRecheckAt: number;
  reloadProviderRegistry: (options: { markAutoRecheckAt: number }) => void;
}) {
  const {
    providersLoaded,
    providerCount,
    registryState,
    retryable,
    providerRegistrySetupHref,
    lastAutoProviderRegistryRecheckAt,
    reloadProviderRegistry,
  } = input;

  useEffect(() => {
    const browserGlobals = globalThis as unknown as {
      window?: BrowserWindowLike;
      document?: BrowserDocumentLike;
    };
    const activeWindow = browserGlobals.window;
    const activeDocument = browserGlobals.document;
    if (!activeWindow || !activeDocument) {
      return;
    }
    const currentWindow = activeWindow;
    const currentDocument = activeDocument;

    function maybeAutoRecheck(): void {
      const now = Date.now();
      const shouldRecheck = shouldAutoRecheckProviderRegistry({
        providersLoaded,
        providerCount,
        registryState,
        retryable,
        hasSetupHref: Boolean(providerRegistrySetupHref),
        documentVisible: currentDocument.visibilityState !== 'hidden',
        lastAutoRecheckAt: lastAutoProviderRegistryRecheckAt,
        now,
      });
      if (!shouldRecheck) {
        return;
      }
      reloadProviderRegistry({ markAutoRecheckAt: now });
    }

    const nextAutoRecheckDelayMs = resolveProviderRegistryAutoRecheckDelayMs({
      providersLoaded,
      providerCount,
      registryState,
      retryable,
      hasSetupHref: Boolean(providerRegistrySetupHref),
      documentVisible: currentDocument.visibilityState !== 'hidden',
      lastAutoRecheckAt: lastAutoProviderRegistryRecheckAt,
      now: Date.now(),
    });
    const timeout = nextAutoRecheckDelayMs === null
      ? null
      : setTimeout(maybeAutoRecheck, nextAutoRecheckDelayMs);

    currentWindow.addEventListener('focus', maybeAutoRecheck);
    currentDocument.addEventListener('visibilitychange', maybeAutoRecheck);
    return () => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      currentWindow.removeEventListener('focus', maybeAutoRecheck);
      currentDocument.removeEventListener('visibilitychange', maybeAutoRecheck);
    };
  }, [
    lastAutoProviderRegistryRecheckAt,
    providerCount,
    providerRegistrySetupHref,
    providersLoaded,
    registryState,
    retryable,
    reloadProviderRegistry,
  ]);
}
