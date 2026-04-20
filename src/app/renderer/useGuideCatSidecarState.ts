import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import type { GuideCatPlacement, GuideCatSidecarMode } from '../../shared/platform-contract.js';
import { isSettingsPath } from '../../shared/settingsRoute.js';

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

function resolveManualOpenState(
  mode: GuideCatSidecarMode,
  prefersBubble = false,
): GuideCatSidecarInnerState {
  // `prefersBubble` is set when the surface is too cramped for the full
  // drawer panel (e.g. /settings with a docked pill). In that case auto
  // mode downgrades to the bubble peek so the panel does not cover the
  // settings canvas. Bubble mode keeps its native peek regardless.
  if (mode === 'bubble') return 'welcome-peek';
  if (prefersBubble && mode === 'auto') return 'welcome-peek';
  return 'open';
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

export interface GuideCatProactiveGreetingTickResult {
  queue: GuideCatProactiveGreetingQueue;
  commit: { innerState: GuideCatSidecarInnerState; proactive: boolean } | null;
}

/** Pure step combining queue → consume → resolve for the proactive greeting
 * effect. Keeping it outside of React lets tests lock in the one-shot
 * contract: once a token is consumed, subsequent ticks with the same token
 * must not re-open the peek even if `mode` changes, because proactive is
 * a fire-once event and later mode switches are user intent, not replay. */
export function tickGuideCatProactiveGreeting(input: {
  queue: GuideCatProactiveGreetingQueue;
  token: number;
  isHiddenRoute: boolean;
  mode: GuideCatSidecarMode;
}): GuideCatProactiveGreetingTickResult {
  const queued = queueGuideCatProactiveGreeting(input.queue, input.token);
  const consumed = consumeGuideCatProactiveGreeting(queued, input.isHiddenRoute);
  if (!consumed.shouldOpen) {
    return { queue: consumed.queue, commit: null };
  }
  return {
    queue: consumed.queue,
    commit: {
      innerState: resolveGuideCatSidecarProactiveState(input.mode),
      proactive: true,
    },
  };
}

export function toggleGuideCatSidecarState(
  prev: GuideCatSidecarInnerState,
  mode: GuideCatSidecarMode,
  prefersBubble = false,
): { nextState: GuideCatSidecarInnerState; persistSeen: boolean } {
  if (prev === 'collapsed') {
    return { nextState: resolveManualOpenState(mode, prefersBubble), persistSeen: false };
  }
  if (prev === 'welcome-peek') {
    if (mode === 'bubble' || (prefersBubble && mode === 'auto')) {
      // Cramped-surface auto mirrors bubble's collapsed ↔ welcome-peek cycle
      // so the user stays in the same shape instead of getting a surprise
      // drawer on the next click.
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
  placement: GuideCatPlacement = 'floating',
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
  // `mode` is read via ref inside the proactive effect so later mode
  // changes don't re-run the effect and replay the one-shot greeting. The
  // inline ref update is safe here because `useEffect` always runs after
  // render commits — the effect sees the latest committed mode.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const isSetupRoute = location.pathname === '/setup';
  const isSettingsRoute = isSettingsPath(location.pathname);
  // Settings hides the sidecar for floating placement because there is no
  // canvas to anchor against, but a docked pill should still be clickable
  // from the sidebar chrome even while the settings page is open. The
  // `prefersBubble` hint below downgrades that click from the drawer panel
  // to the speech-bubble peek so the panel does not smother settings.
  const isHiddenRoute = isSetupRoute || (isSettingsRoute && placement !== 'docked');
  const prefersBubble = isSettingsRoute && placement === 'docked';

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
    // Proactive greeting glue (queue → consume → resolve) lives in
    // `tickGuideCatProactiveGreeting` so the one-shot-on-mode-change
    // contract is unit-testable without React. See that function's doc.
    const result = tickGuideCatProactiveGreeting({
      queue: proactiveQueueRef.current,
      token: proactiveGreetingToken,
      isHiddenRoute,
      mode: modeRef.current,
    });
    proactiveQueueRef.current = result.queue;
    if (!result.commit) {
      return;
    }
    const { innerState: nextInnerState, proactive: nextProactive } = result.commit;
    setProactive(nextProactive);
    setInnerState((prev) => (prev === nextInnerState ? prev : nextInnerState));
  }, [isHiddenRoute, proactiveGreetingToken]);

  const viewState: GuideCatSidecarViewState = isHiddenRoute ? 'hidden' : innerState;

  const toggle = useCallback(() => {
    setProactive(false);
    setInnerState((prev) => {
      const transition = toggleGuideCatSidecarState(prev, mode, prefersBubble);
      if (transition.persistSeen) {
        onPersistSeen();
      }
      return transition.nextState;
    });
  }, [mode, onPersistSeen, prefersBubble]);

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
