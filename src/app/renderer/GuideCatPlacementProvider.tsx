import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import type { GuideCatRecord } from '../../core/types.js';
import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
  GuideCatSidecarMode,
} from '../../shared/platform-contract.js';
import { SIDE_PANEL_LAYOUT_EVENT } from '../../design/components/SidePanel.js';
import { hideTooltipPortal } from '../../products/chat/renderer/tooltipPortal.js';
import { readSidePanelRightBlockedLeft } from './guideCatPanelDetection.js';
import {
  useGuideCatSidecarState,
  type GuideCatSidecarState,
} from './useGuideCatSidecarState.js';
import {
  GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX,
  clampFloatingAnchorToSafeArea,
  hasDragMovement,
  isPointerOverSlotCorridor,
  projectFloatingAnchorToNormalized,
  resolveActiveDockSlot,
  resolveEffectiveFloatingAnchor,
  resolveGuideCatProjection,
  resolveGuideCatSafeArea,
  resolveGuideCatSurfaceClass,
  type GuideCatDockSlotKind,
  type GuideCatProjection,
  type GuideCatSafeArea,
  type GuideCatSlotRect,
  type GuideCatSurfaceClass,
  type GuideCatViewportRect,
} from './guideCatPlacement.js';

interface DockSlotState {
  preview: boolean;
  active: boolean;
}

export interface GuideCatPlacementContextValue {
  guideCat: GuideCatRecord | null;
  projection: GuideCatProjection;
  dockSlotState: Record<GuideCatDockSlotKind, DockSlotState>;
  pillRef: MutableRefObject<HTMLElement | null>;
  registerSlotRef: (slot: GuideCatDockSlotKind, node: HTMLElement | null) => void;
  onFloatingPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onDockedPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Returns true if the previous pointer interaction was a drag; consuming
      resets the flag so the next click is allowed through. */
  consumePillClickSuppression: () => boolean;
  presentation: GuideCatSidecarState;
  dragActive: boolean;
  /** Viewport x (px) where the open-state panel should start its left edge,
   * so it hugs the chrome (workspace sidebar right edge, or lobby left edge)
   * rather than drifting with the pill centre. */
  panelOriginX: number;
  /** Live viewport rect of a registered dock slot, or null when the slot
   * is not currently mounted. Used by the sidecar to anchor the bubble-mode
   * peek next to the docked pill without caching stale geometry. */
  getDockSlotRect: (slot: GuideCatDockSlotKind) => GuideCatSlotRect | null;
}

const GuideCatPlacementContext = createContext<GuideCatPlacementContextValue | null>(null);

interface DragState {
  mode: 'floating' | 'docked';
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  /** Pill centre at drag start. Visible pill position during drag is
      basePillX/Y + (currentX/Y - startX/Y) so a click at the pill edge does
      not jump the pill under the pointer. */
  basePillX: number;
  basePillY: number;
  /** Becomes true once the pointer moves past the drag-movement threshold.
      Pre-activation is indistinguishable from a click (no dock slots
      revealed, no preview, no collapse). */
  activated: boolean;
  overSlot: GuideCatDockSlotKind | null;
  escaped: boolean;
}

export interface GuideCatPlacementProviderProps {
  guideCat: GuideCatRecord | null;
  placement: GuideCatPlacement;
  floatingAnchor: GuideCatFloatingAnchor | null;
  sidecarSeen: boolean;
  sidecarMode: GuideCatSidecarMode;
  onPersistSeen: () => void;
  onCommit: (patch: {
    placement?: GuideCatPlacement;
    floatingAnchor?: GuideCatFloatingAnchor | null;
  }) => void;
  children: ReactNode;
}

export function GuideCatPlacementProvider({
  guideCat,
  placement,
  floatingAnchor,
  sidecarSeen,
  sidecarMode,
  onPersistSeen,
  onCommit,
  children,
}: GuideCatPlacementProviderProps) {
  const presentation = useGuideCatSidecarState(sidecarSeen, sidecarMode, onPersistSeen);
  const location = useLocation();
  const surface: GuideCatSurfaceClass = resolveGuideCatSurfaceClass(location.pathname);

  const [viewport, setViewport] = useState<GuideCatViewportRect>(() =>
    readViewport());
  const [topChromeBottom, setTopChromeBottom] = useState<number | null>(null);
  const [sidebarRight, setSidebarRight] = useState<number | null>(null);
  const [workspaceRightBlockedLeft, setWorkspaceRightBlockedLeft] = useState<number | null>(null);

  const slotRefs = useRef<Record<GuideCatDockSlotKind, HTMLElement | null>>({
    lobby: null,
    workspace: null,
  });
  const slotRects = useRef<Record<GuideCatDockSlotKind, GuideCatSlotRect | null>>({
    lobby: null,
    workspace: null,
  });
  const pillRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  /** Authoritative, synchronously-readable drag state. `drag` React state
   * mirrors this ref for rendering. Handlers must write the ref BEFORE
   * calling setDrag, and read from the ref (not closure `drag` or a stale
   * argument) so a pointerup that lands between the last pointermove's
   * setDrag and React's flush still sees the final overSlot / coords. */
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDragState] = useState<DragState | null>(null);
  const setDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handle = () => setViewport(readViewport());
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const lobbyBar = document.querySelector<HTMLElement>('.lobbyTopBar');
    if (!lobbyBar) {
      setTopChromeBottom(null);
      return;
    }
    const update = () => setTopChromeBottom(lobbyBar.getBoundingClientRect().bottom);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(lobbyBar);
    return () => observer.disconnect();
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const sidebar = document.querySelector<HTMLElement>('aside.sidebar');
    if (!sidebar) {
      setSidebarRight(null);
      return;
    }
    const update = () => setSidebarRight(sidebar.getBoundingClientRect().right);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(sidebar);
    let mutation: MutationObserver | null = null;
    if (typeof MutationObserver === 'function') {
      mutation = new MutationObserver(update);
      mutation.observe(sidebar, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    return () => {
      resize.disconnect();
      mutation?.disconnect();
    };
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }
    const update = () => {
      const next = surface === 'workspace'
        ? readSidePanelRightBlockedLeft(document)
        : null;
      setWorkspaceRightBlockedLeft((current) => (current === next ? current : next));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener(SIDE_PANEL_LAYOUT_EVENT, update as EventListener);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener(SIDE_PANEL_LAYOUT_EVENT, update as EventListener);
    };
  }, [surface, location.pathname]);

  const safeArea: GuideCatSafeArea = useMemo(
    () => resolveGuideCatSafeArea({
      surface,
      viewport,
      topChromeBottom,
      sidebarRight,
      rightBlockedLeft: workspaceRightBlockedLeft,
    }),
    [surface, viewport, topChromeBottom, sidebarRight, workspaceRightBlockedLeft],
  );

  const baseProjection: GuideCatProjection = useMemo(
    () =>
      resolveGuideCatProjection({
        placement,
        anchor: floatingAnchor,
        surface,
        viewport,
        safeArea,
      }),
    [placement, floatingAnchor, surface, viewport, safeArea],
  );

  const projection: GuideCatProjection = useMemo(() => {
    if (!drag || !drag.activated) {
      return baseProjection;
    }
    const dx = drag.currentX - drag.startX;
    const dy = drag.currentY - drag.startY;
    if (drag.mode === 'floating') {
      return {
        kind: 'floating',
        x: clampToViewport(drag.basePillX + dx, viewport.width),
        y: clampToViewport(drag.basePillY + dy, viewport.height),
        overrideReason: null,
      };
    }
    if (drag.mode === 'docked' && !drag.escaped) {
      return baseProjection;
    }
    if (drag.mode === 'docked' && drag.escaped) {
      return {
        kind: 'floating',
        x: clampToViewport(drag.basePillX + dx, viewport.width),
        y: clampToViewport(drag.basePillY + dy, viewport.height),
        overrideReason: null,
      };
    }
    return baseProjection;
  }, [baseProjection, drag, viewport]);

  const dockSlotState: Record<GuideCatDockSlotKind, DockSlotState> = useMemo(() => {
    const activeSlot = resolveActiveDockSlot(surface);
    const dockedActive = placement === 'docked' && activeSlot != null;
    const previewSlot =
      drag?.mode === 'floating' && drag.activated ? drag.overSlot : null;
    return {
      lobby: {
        active: dockedActive && activeSlot === 'lobby',
        preview: previewSlot === 'lobby',
      },
      workspace: {
        active: dockedActive && activeSlot === 'workspace',
        preview: previewSlot === 'workspace',
      },
    };
  }, [placement, surface, drag]);

  const registerSlotRef = useCallback(
    (slot: GuideCatDockSlotKind, node: HTMLElement | null) => {
      slotRefs.current[slot] = node;
      slotRects.current[slot] = node ? readSlotRect(node) : null;
    },
    [],
  );

  const refreshSlotRects = useCallback(() => {
    (Object.keys(slotRefs.current) as GuideCatDockSlotKind[]).forEach((slot) => {
      const node = slotRefs.current[slot];
      slotRects.current[slot] = node ? readSlotRect(node) : null;
    });
  }, []);

  const getDockSlotRect = useCallback(
    (slot: GuideCatDockSlotKind): GuideCatSlotRect | null => {
      // Re-measure on demand rather than returning the cached rect — the
      // cache is updated during drag/register events but callers (e.g.
      // bubble-mode peek anchoring) want the current geometry after
      // layout shifts that don't run through this provider.
      const node = slotRefs.current[slot];
      return node ? readSlotRect(node) : null;
    },
    [],
  );

  const commitFloatingRelease = useCallback(
    (pointerX: number, pointerY: number) => {
      const anchor = projectFloatingAnchorToNormalized({
        pointerX,
        pointerY,
        viewport,
      });
      const effective = resolveEffectiveFloatingAnchor(anchor);
      const clamped = clampFloatingAnchorToSafeArea({
        anchor: effective,
        viewport,
        safeArea,
      });
      const normalized = projectFloatingAnchorToNormalized({
        pointerX: clamped.x,
        pointerY: clamped.y,
        viewport,
      });
      onCommit({ floatingAnchor: normalized });
    },
    [onCommit, safeArea, viewport],
  );

  const commitDockRelease = useCallback(
    (slot: GuideCatDockSlotKind) => {
      onCommit({ placement: 'docked' });
      void slot;
    },
    [onCommit],
  );

  const endDrag = useCallback(
    (state: DragState) => {
      const moved = hasDragMovement({
        startX: state.startX,
        startY: state.startY,
        currentX: state.currentX,
        currentY: state.currentY,
      });
      const pillX = state.basePillX + (state.currentX - state.startX);
      const pillY = state.basePillY + (state.currentY - state.startY);
      if (state.mode === 'floating' && state.overSlot) {
        commitDockRelease(state.overSlot);
        suppressClickRef.current = true;
      } else if (state.mode === 'floating' && moved) {
        commitFloatingRelease(pillX, pillY);
        suppressClickRef.current = true;
      } else if (state.mode === 'docked' && state.escaped) {
        onCommit({ placement: 'floating' });
        commitFloatingRelease(pillX, pillY);
        suppressClickRef.current = true;
      }
      setDrag(null);
    },
    [commitDockRelease, commitFloatingRelease, onCommit],
  );

  const handleMove = useCallback(
    (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const nextState: DragState = {
        ...active,
        currentX: event.clientX,
        currentY: event.clientY,
      };

      if (!active.activated) {
        const crossed = hasDragMovement({
          startX: active.startX,
          startY: active.startY,
          currentX: event.clientX,
          currentY: event.clientY,
        });
        if (!crossed) {
          setDrag(nextState);
          return;
        }
        // First real drag motion: reveal dock slots, suppress any open
        // guide-cat panel, hide tooltip, and read slot rects for corridor
        // detection in the same synchronous block.
        nextState.activated = true;
        if (typeof document !== 'undefined') {
          document.body.classList.add(GUIDE_CAT_DRAGGING_BODY_CLASS);
        }
        hideGlobalTooltip();
        presentation.collapse();
        refreshSlotRects();
      }

      if (active.mode === 'floating') {
        const target = resolveActiveDockSlot(surface);
        if (target) {
          const rect = slotRects.current[target];
          if (
            isPointerOverSlotCorridor({
              pointerX: event.clientX,
              pointerY: event.clientY,
              slotRect: rect,
            })
          ) {
            nextState.overSlot = target;
          } else {
            nextState.overSlot = null;
          }
        } else {
          nextState.overSlot = null;
        }
      } else if (active.mode === 'docked') {
        const dx = event.clientX - active.startX;
        const dy = event.clientY - active.startY;
        if (!active.escaped && Math.hypot(dx, dy) >= GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX) {
          nextState.escaped = true;
        }
      }
      setDrag(nextState);
    },
    [presentation, refreshSlotRects, setDrag, surface],
  );

  const handleUp = useCallback(
    (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const finalState: DragState = {
        ...active,
        currentX: event.clientX,
        currentY: event.clientY,
      };
      endDrag(finalState);
    },
    [endDrag],
  );

  useEffect(() => {
    if (!drag) return;
    const onCancel = (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || event.pointerId !== active.pointerId) return;
      setDrag(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, handleMove, handleUp, setDrag]);

  const dragActivated = Boolean(drag?.activated);

  /* Match the pre-refactor offsets: product/workspace panel sticks right
   * against the sidebar right edge; lobby panel starts flush at the viewport
   * edge. */
  const panelOriginX = useMemo(() => {
    if (surface === 'workspace' && sidebarRight != null) {
      return Math.max(0, Math.round(sidebarRight));
    }
    return 0;
  }, [surface, sidebarRight]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (dragActivated) {
      // handleMove already adds the class synchronously so slot rects read
      // correctly on the first corridor check; reinforce here in case the
      // render cycle somehow raced, and clean up when the drag ends.
      document.body.classList.add(GUIDE_CAT_DRAGGING_BODY_CLASS);
      return () => {
        document.body.classList.remove(GUIDE_CAT_DRAGGING_BODY_CLASS);
        // Drop any tooltip that got scheduled or painted while the drag was
        // in progress (e.g. hover-delay timer that fired mid-drag). Without
        // this the tooltip would pop back into view the moment the dragging
        // class clears.
        hideGlobalTooltip();
      };
    }
  }, [dragActivated]);

  const onFloatingPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      // Close any transient chrome surface (account menu, surface switcher,
      // overflow menu, or non-pinned side panel) that follows document-level
      // outside-click semantics before the guide-cat interaction proceeds.
      dismissTransientChrome();
      // Predict the dismissal: the safe-area state won't update until the
      // dismissed panel actually unmounts (async React commit). Reading
      // pinned panels only lets dismissible panels — which we just asked to
      // close — drop out of the predicted safe area, while pinned panels
      // that will survive the outside-click stay in it. The unmount's
      // layout event reconciles this value as soon as the panel is gone.
      setWorkspaceRightBlockedLeft(
        readSidePanelRightBlockedLeft(document, { pinnedOnly: true }),
      );
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const basePillX = rect.left + rect.width / 2;
      const basePillY = rect.top + rect.height / 2;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      // Do NOT reveal dock slots, collapse the panel, or hide tooltips yet:
      // pointerdown may turn out to be a click, in which case no drag UI
      // should flash. Those side effects run in handleMove once movement
      // passes the drag-movement threshold.
      setDrag({
        mode: 'floating',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        basePillX,
        basePillY,
        activated: false,
        overSlot: null,
        escaped: false,
      });
    },
    [],
  );

  const onDockedPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      dismissTransientChrome();
      // See onFloatingPointerDown: pinnedOnly keeps any pinned panel in the
      // predicted safe area while letting dismissible ones drop out.
      setWorkspaceRightBlockedLeft(
        readSidePanelRightBlockedLeft(document, { pinnedOnly: true }),
      );
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const basePillX = rect.left + rect.width / 2;
      const basePillY = rect.top + rect.height / 2;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      setDrag({
        mode: 'docked',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        basePillX,
        basePillY,
        activated: false,
        overSlot: null,
        escaped: false,
      });
    },
    [],
  );

  const consumePillClickSuppression = useCallback(() => {
    const was = suppressClickRef.current;
    suppressClickRef.current = false;
    return was;
  }, []);

  const value: GuideCatPlacementContextValue = useMemo(
    () => ({
      guideCat,
      projection,
      dockSlotState,
      pillRef,
      registerSlotRef,
      onFloatingPointerDown,
      onDockedPointerDown,
      consumePillClickSuppression,
      presentation,
      dragActive: dragActivated,
      panelOriginX,
      getDockSlotRect,
    }),
    [
      guideCat,
      projection,
      dockSlotState,
      registerSlotRef,
      onFloatingPointerDown,
      onDockedPointerDown,
      consumePillClickSuppression,
      presentation,
      dragActivated,
      panelOriginX,
      getDockSlotRect,
    ],
  );

  return (
    <GuideCatPlacementContext.Provider value={value}>
      {children}
    </GuideCatPlacementContext.Provider>
  );
}

export function useGuideCatPlacement(): GuideCatPlacementContextValue {
  const value = useContext(GuideCatPlacementContext);
  if (!value) {
    throw new Error('useGuideCatPlacement requires GuideCatPlacementProvider');
  }
  return value;
}

export function useRegisterGuideCatDockSlot(slot: GuideCatDockSlotKind) {
  const { registerSlotRef } = useGuideCatPlacement();
  return useCallback(
    (node: HTMLElement | null) => {
      registerSlotRef(slot, node);
    },
    [registerSlotRef, slot],
  );
}

function readViewport(): GuideCatViewportRect {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function clampToViewport(value: number, max: number): number {
  if (max <= 0) return value;
  return Math.min(max, Math.max(0, value));
}

function hideGlobalTooltip(): void {
  // Delegate to the tooltip portal so any pending delayed show is cancelled
  // as well — a naked DOM class removal would still let a queued showTimer
  // fire and repaint the tooltip mid-drag or after release.
  hideTooltipPortal();
}

/** Events dispatched by `dismissTransientChrome` carry this symbol so the
 * guide-cat's own document-level listeners (the sidecar's outside-click
 * collapse) can recognise the synthetic mousedown as our own bookkeeping
 * and skip it. Other chrome (account menu, side panel) has no reason to
 * check for this and continues to self-dismiss on the same event. */
const GUIDE_CAT_DISMISS_EVENT_SYMBOL: unique symbol = Symbol.for(
  'cats.guideCat.dismissTransientChrome',
);

export function isGuideCatDismissTransientChromeEvent(event: Event): boolean {
  return Boolean(
    (event as unknown as Record<symbol, unknown>)[GUIDE_CAT_DISMISS_EVENT_SYMBOL],
  );
}

/** Synthesise a `mousedown` on `document.body` so any transient chrome surface
 * with document-level outside-click semantics self-dismisses before the
 * guide-cat interaction continues. This intentionally covers more than menus:
 * unpinned side panels that share the same contract should close too. The
 * event is tagged with `GUIDE_CAT_DISMISS_EVENT_SYMBOL` so the guide-cat's
 * own sidecar listener can ignore it — otherwise clicking a docked pill
 * while the sidecar panel is open would collapse the panel synthetically,
 * only for the click to immediately toggle it back open. */
function dismissTransientChrome(): void {
  if (typeof document === 'undefined' || typeof MouseEvent === 'undefined') return;
  const evt = new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: typeof window !== 'undefined' ? window : undefined,
    button: 0,
  });
  (evt as unknown as Record<symbol, unknown>)[GUIDE_CAT_DISMISS_EVENT_SYMBOL] = true;
  document.body.dispatchEvent(evt);
}

const GUIDE_CAT_DRAGGING_BODY_CLASS = 'guideCatDragging';

function readSlotRect(node: HTMLElement): GuideCatSlotRect {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}
