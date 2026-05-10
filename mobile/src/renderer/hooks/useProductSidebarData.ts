import { useMemo } from 'react';

import type { MobileApiError } from '../../api/client';
import {
  type MobileAppShellPayload,
  type MobileSidebarRecent,
  selectMobileProductRecents,
} from '../../../../src/mobile/index.js';
import { useMobileAppShell } from './useMobileAppShell';

/**
 * Recents projection for the trimmed product sidebar. The Chat / Code
 * / Work tabs render three primary action chips plus a Recents list;
 * the MY-lens section was removed in 2026-05-05 (cat / clowder /
 * cattery rosters live under the Cats tab now), so this hook only
 * yields recents off the shared `useMobileAppShell` fetch.
 *
 * The full `payload` is exposed alongside `recents` so callers can
 * derive product-specific extras without re-fetching `/api/app-shell`
 * (the Chat tab uses this to project the DIRECT MESSAGES section
 * via `selectMobileChatDirectLaneCats` /
 * `findMobileDirectLaneForCat`). Code / Work simply ignore the
 * payload field.
 */

export type ProductSidebarState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; error: MobileApiError }
  | {
      kind: 'data';
      recents: MobileSidebarRecent[];
      payload: MobileAppShellPayload;
    };

export interface ProductSidebarHook {
  state: ProductSidebarState;
  refetch: () => void;
}

export function useProductSidebarData(
  product: 'chat' | 'code' | 'work',
): ProductSidebarHook {
  const { state: shellState, refetch } = useMobileAppShell();
  const recents = useMemo(() => {
    if (shellState.kind !== 'data') {
      return null;
    }
    return selectMobileProductRecents(shellState.payload, product);
  }, [shellState, product]);

  let state: ProductSidebarState;
  switch (shellState.kind) {
    case 'loading':
      state = { kind: 'loading' };
      break;
    case 'unconfigured':
      state = { kind: 'unconfigured' };
      break;
    case 'unauthenticated':
      state = { kind: 'unauthenticated' };
      break;
    case 'error':
      state = { kind: 'error', error: shellState.error };
      break;
    case 'data':
      state = {
        kind: 'data',
        recents: recents!,
        payload: shellState.payload,
      };
      break;
  }

  return { state, refetch };
}
