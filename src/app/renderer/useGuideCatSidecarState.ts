import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { GuideCatSidecarMode } from '../../shared/platform-contract.js';

export type GuideCatSidecarViewState = 'hidden' | 'collapsed' | 'welcome-peek' | 'open';
type GuideCatSidecarInnerState = Exclude<GuideCatSidecarViewState, 'hidden'>;

export interface GuideCatProactiveGreetingQueue {
  lastQueuedToken: number;
  pendingToken: number | null;
}

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

export function queueGuideCatProactiveGreeting(
  current: GuideCatProactiveGreetingQueue,
  nextToken: number,
): GuideCatProactiveGreetingQueue {
  if (nextToken <= current.lastQueuedToken) {
    return current;
  }
  return {
    lastQueuedToken: nextToken,
    pendingToken: nextToken,
  };
}

export function consumeGuideCatProactiveGreeting(
  current: GuideCatProactiveGreetingQueue,
  isHiddenRoute: boolean,
): { queue: GuideCatProactiveGreetingQueue; shouldOpen: boolean } {
  if (isHiddenRoute || current.pendingToken == null) {
    return { queue: current, shouldOpen: false };
  }
  return {
    queue: {
      ...current,
      pendingToken: null,
    },
    shouldOpen: true,
  };
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

export function resolveGuideCatSidecarPreferenceState(): GuideCatSidecarInnerState {
  return resolveGuideCatSidecarRestingState();
}

export function useGuideCatSidecarState(
  mode: GuideCatSidecarMode,
  onPersistSeen: () => void,
  proactiveGreetingToken = 0,
): GuideCatSidecarState {
  const location = useLocation();
  const [innerState, setInnerState] = useState<GuideCatSidecarInnerState>(
    () => resolveGuideCatSidecarPreferenceState(),
  );
  const [proactive, setProactive] = useState(false);
  const proactiveQueueRef = useRef<GuideCatProactiveGreetingQueue>({
    lastQueuedToken: 0,
    pendingToken: null,
  });

  const isHiddenRoute =
    location.pathname === '/setup'
    || location.pathname.startsWith('/settings');

  useEffect(() => {
    if (!isHiddenRoute) {
      return;
    }

    setProactive(false);
    setInnerState((prev) => {
      const nextState = resolveGuideCatSidecarPreferenceState();
      return prev === nextState ? prev : nextState;
    });
  }, [isHiddenRoute]);

  useEffect(() => {
    const queued = queueGuideCatProactiveGreeting(
      proactiveQueueRef.current,
      proactiveGreetingToken,
    );
    proactiveQueueRef.current = queued;

    const consumed = consumeGuideCatProactiveGreeting(proactiveQueueRef.current, isHiddenRoute);
    proactiveQueueRef.current = consumed.queue;
    if (!consumed.shouldOpen) {
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
