import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { GuideCatSidecarMode } from '../../shared/platform-contract.js';

export type GuideCatSidecarViewState = 'hidden' | 'collapsed' | 'welcome-peek' | 'open';
type GuideCatSidecarInnerState = Exclude<GuideCatSidecarViewState, 'hidden'>;

export interface GuideCatSidecarState {
  viewState: GuideCatSidecarViewState;
  /** True when the current peek/open was initiated by the system, not by user click. */
  proactive: boolean;
  toggle: () => void;
  collapse: () => void;
  dismissWelcome: () => void;
}

function resolveOpenState(mode: GuideCatSidecarMode): GuideCatSidecarInnerState {
  return mode === 'bubble' ? 'welcome-peek' : 'open';
}

export function toggleGuideCatSidecarState(
  prev: GuideCatSidecarInnerState,
  mode: GuideCatSidecarMode,
): { nextState: GuideCatSidecarInnerState; persistSeen: boolean } {
  if (prev === 'collapsed') {
    return { nextState: resolveOpenState(mode), persistSeen: false };
  }
  if (prev === 'welcome-peek') {
    if (mode === 'bubble') {
      return { nextState: 'collapsed', persistSeen: true };
    }
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

export function resolveGuideCatSidecarPreferenceState(
  sidecarSeen: boolean,
  mode: GuideCatSidecarMode,
): GuideCatSidecarInnerState {
  if (!sidecarSeen && mode !== 'drawer') {
    return 'welcome-peek';
  }
  return 'collapsed';
}

export function useGuideCatSidecarState(
  sidecarSeen: boolean,
  mode: GuideCatSidecarMode,
  onPersistSeen: () => void,
): GuideCatSidecarState {
  const location = useLocation();
  const [innerState, setInnerState] = useState<GuideCatSidecarInnerState>(
    () => resolveGuideCatSidecarPreferenceState(sidecarSeen, mode),
  );
  const [proactive, setProactive] = useState(
    () => resolveGuideCatSidecarPreferenceState(sidecarSeen, mode) === 'welcome-peek',
  );

  const isHiddenRoute =
    location.pathname === '/setup'
    || location.pathname.startsWith('/settings');

  useEffect(() => {
    if (!isHiddenRoute) {
      return;
    }

    setInnerState((prev) => {
      const nextState = resolveGuideCatSidecarPreferenceState(sidecarSeen, mode);
      return prev === nextState ? prev : nextState;
    });
  }, [isHiddenRoute, mode, sidecarSeen]);

  const viewState: GuideCatSidecarViewState = isHiddenRoute ? 'hidden' : innerState;

  const toggle = useCallback(() => {
    setProactive(false);
    setInnerState((prev) => {
      const transition = toggleGuideCatSidecarState(prev, mode);
      if (transition.persistSeen) {
        onPersistSeen();
      }
      return transition.nextState;
    });
  }, [mode, onPersistSeen]);

  const collapse = useCallback(() => {
    setProactive(false);
    setInnerState((prev) => {
      const transition = collapseGuideCatSidecarState(prev);
      if (transition.persistSeen) {
        onPersistSeen();
      }
      return transition.nextState;
    });
  }, [onPersistSeen]);

  const dismissWelcome = useCallback(() => {
    setProactive(false);
    setInnerState('collapsed');
    onPersistSeen();
  }, [onPersistSeen]);

  return { viewState, proactive, toggle, collapse, dismissWelcome };
}
