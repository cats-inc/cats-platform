import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { dispatchPlatformEnvelopeRefresh } from './platformEnvelopeEvents.js';

export type GuideCatSidecarViewState = 'hidden' | 'collapsed' | 'welcome-peek' | 'open';
type GuideCatSidecarInnerState = Exclude<GuideCatSidecarViewState, 'hidden'>;

export interface GuideCatSidecarState {
  viewState: GuideCatSidecarViewState;
  toggle: () => void;
  collapse: () => void;
  dismissWelcome: () => void;
}

function persistSidecarSeen(): void {
  void fetch('/api/platform/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ guideCatSidecarSeen: true }),
  })
    .then((response) => {
      if (response.ok) {
        dispatchPlatformEnvelopeRefresh();
      }
    })
    .catch(() => {});
}

export function toggleGuideCatSidecarState(
  prev: GuideCatSidecarInnerState,
): { nextState: GuideCatSidecarInnerState; persistSeen: boolean } {
  if (prev === 'collapsed') {
    return { nextState: 'open', persistSeen: false };
  }
  if (prev === 'welcome-peek') {
    return { nextState: 'open', persistSeen: true };
  }
  return { nextState: 'collapsed', persistSeen: false };
}

export function collapseGuideCatSidecarState(
  prev: GuideCatSidecarInnerState,
): { nextState: GuideCatSidecarInnerState; persistSeen: boolean } {
  return {
    nextState: 'collapsed',
    persistSeen: prev === 'welcome-peek',
  };
}

export function useGuideCatSidecarState(
  sidecarSeen: boolean,
): GuideCatSidecarState {
  const location = useLocation();
  const [innerState, setInnerState] = useState<GuideCatSidecarInnerState>(
    () => sidecarSeen ? 'collapsed' : 'welcome-peek',
  );

  const isHiddenRoute =
    location.pathname === '/setup'
    || location.pathname.startsWith('/settings');

  const viewState: GuideCatSidecarViewState = isHiddenRoute ? 'hidden' : innerState;

  const toggle = useCallback(() => {
    setInnerState((prev) => {
      const transition = toggleGuideCatSidecarState(prev);
      if (transition.persistSeen) {
        persistSidecarSeen();
      }
      return transition.nextState;
    });
  }, []);

  const collapse = useCallback(() => {
    setInnerState((prev) => {
      const transition = collapseGuideCatSidecarState(prev);
      if (transition.persistSeen) {
        persistSidecarSeen();
      }
      return transition.nextState;
    });
  }, []);

  const dismissWelcome = useCallback(() => {
    setInnerState('collapsed');
    persistSidecarSeen();
  }, []);

  return { viewState, toggle, collapse, dismissWelcome };
}
