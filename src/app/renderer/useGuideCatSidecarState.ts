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

function resolveManualOpenState(mode: GuideCatSidecarMode): GuideCatSidecarInnerState {
  return mode === 'bubble' ? 'welcome-peek' : 'open';
}

export function resolveGuideCatSidecarRestingState(): GuideCatSidecarInnerState {
  return 'collapsed';
}

export function resolveGuideCatSidecarProactiveState(
  mode: GuideCatSidecarMode,
): GuideCatSidecarInnerState {
  return mode === 'drawer' ? 'open' : 'welcome-peek';
}

export function toggleGuideCatSidecarState(
  prev: GuideCatSidecarInnerState,
  mode: GuideCatSidecarMode,
): { nextState: GuideCatSidecarInnerState; persistSeen: boolean } {
  if (prev === 'collapsed') {
    return { nextState: resolveManualOpenState(mode), persistSeen: false };
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
  _sidecarSeen: boolean,
  _mode: GuideCatSidecarMode,
): GuideCatSidecarInnerState {
  return resolveGuideCatSidecarRestingState();
}

export function useGuideCatSidecarState(
  sidecarSeen: boolean,
  mode: GuideCatSidecarMode,
  onPersistSeen: () => void,
  proactiveGreetingToken = 0,
): GuideCatSidecarState {
  const location = useLocation();
  const [innerState, setInnerState] = useState<GuideCatSidecarInnerState>(
    () => resolveGuideCatSidecarPreferenceState(sidecarSeen, mode),
  );
  const [proactive, setProactive] = useState(false);

  const isHiddenRoute =
    location.pathname === '/setup'
    || location.pathname.startsWith('/settings');

  useEffect(() => {
    if (!isHiddenRoute) {
      return;
    }

    setProactive(false);
    setInnerState((prev) => {
      const nextState = resolveGuideCatSidecarPreferenceState(sidecarSeen, mode);
      return prev === nextState ? prev : nextState;
    });
  }, [isHiddenRoute, mode, sidecarSeen]);

  useEffect(() => {
    if (proactiveGreetingToken <= 0 || isHiddenRoute) {
      return;
    }
    setProactive(true);
    setInnerState((prev) => {
      const nextState = resolveGuideCatSidecarProactiveState(mode);
      return prev === nextState ? prev : nextState;
    });
  }, [isHiddenRoute, mode, proactiveGreetingToken]);

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
