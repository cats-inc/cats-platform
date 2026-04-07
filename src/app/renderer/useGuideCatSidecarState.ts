import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type GuideCatSidecarViewState = 'hidden' | 'collapsed' | 'welcome-peek' | 'open';

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
  }).catch(() => {});
}

export function useGuideCatSidecarState(
  sidecarSeen: boolean,
): GuideCatSidecarState {
  const location = useLocation();
  const [innerState, setInnerState] = useState<'collapsed' | 'welcome-peek' | 'open'>(
    () => sidecarSeen ? 'collapsed' : 'welcome-peek',
  );

  const isHiddenRoute =
    location.pathname === '/setup'
    || location.pathname.startsWith('/settings');

  const viewState: GuideCatSidecarViewState = isHiddenRoute ? 'hidden' : innerState;

  const toggle = useCallback(() => {
    setInnerState((prev) => {
      if (prev === 'collapsed') return 'open';
      if (prev === 'welcome-peek') {
        persistSidecarSeen();
        return 'open';
      }
      return 'collapsed';
    });
  }, []);

  const collapse = useCallback(() => {
    setInnerState('collapsed');
  }, []);

  const dismissWelcome = useCallback(() => {
    setInnerState('collapsed');
    persistSidecarSeen();
  }, []);

  return { viewState, toggle, collapse, dismissWelcome };
}
