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
import { dispatchPlatformEnvelopeRefresh } from './platformEnvelopeEvents.js';
import {
  useGuideCatSidecarState,
  type GuideCatSidecarState,
} from './useGuideCatSidecarState.js';
import {
  GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX,
  clampFloatingAnchorToSafeArea,
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
  presentation: GuideCatSidecarState;
  dragActive: boolean;
}

const GuideCatPlacementContext = createContext<GuideCatPlacementContextValue | null>(null);

export interface GuideCatPlacementPreferences {
  placement: GuideCatPlacement;
  floatingAnchor: GuideCatFloatingAnchor | null;
}

interface DragState {
  mode: 'floating' | 'docked';
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  overSlot: GuideCatDockSlotKind | null;
  escaped: boolean;
}

export interface GuideCatPlacementProviderProps {
  guideCat: GuideCatRecord | null;
  placement: GuideCatPlacement;
  floatingAnchor: GuideCatFloatingAnchor | null;
  sidecarSeen: boolean;
  sidecarMode: GuideCatSidecarMode;
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
  onCommit,
  children,
}: GuideCatPlacementProviderProps) {
  const presentation = useGuideCatSidecarState(sidecarSeen, sidecarMode);
  const location = useLocation();
  const surface: GuideCatSurfaceClass = resolveGuideCatSurfaceClass(location.pathname);

  const [viewport, setViewport] = useState<GuideCatViewportRect>(() =>
    readViewport());
  const [topChromeBottom, setTopChromeBottom] = useState<number | null>(null);
  const [sidebarRight, setSidebarRight] = useState<number | null>(null);

  const slotRefs = useRef<Record<GuideCatDockSlotKind, HTMLElement | null>>({
    lobby: null,
    workspace: null,
  });
  const slotRects = useRef<Record<GuideCatDockSlotKind, GuideCatSlotRect | null>>({
    lobby: null,
    workspace: null,
  });
  const pillRef = useRef<HTMLElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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

  const safeArea: GuideCatSafeArea = useMemo(
    () => resolveGuideCatSafeArea({ surface, viewport, topChromeBottom, sidebarRight }),
    [surface, viewport, topChromeBottom, sidebarRight],
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
    if (!drag) {
      return baseProjection;
    }
    if (drag.mode === 'floating') {
      const { x, y } = clampFloatingAnchorToSafeArea({
        anchor: projectFloatingAnchorToNormalized({
          pointerX: drag.currentX,
          pointerY: drag.currentY,
          viewport,
        }),
        viewport,
        safeArea,
      });
      return { kind: 'floating', x, y, overrideReason: null };
    }
    if (drag.mode === 'docked' && !drag.escaped) {
      return baseProjection;
    }
    if (drag.mode === 'docked' && drag.escaped) {
      const { x, y } = clampFloatingAnchorToSafeArea({
        anchor: projectFloatingAnchorToNormalized({
          pointerX: drag.currentX,
          pointerY: drag.currentY,
          viewport,
        }),
        viewport,
        safeArea,
      });
      return { kind: 'floating', x, y, overrideReason: null };
    }
    return baseProjection;
  }, [baseProjection, drag, safeArea, viewport]);

  const dockSlotState: Record<GuideCatDockSlotKind, DockSlotState> = useMemo(() => {
    const activeSlot = resolveActiveDockSlot(surface);
    const dockedActive = placement === 'docked' && activeSlot != null;
    const previewSlot = drag?.mode === 'floating' ? drag.overSlot : null;
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
      if (state.mode === 'floating' && state.overSlot) {
        commitDockRelease(state.overSlot);
      } else if (state.mode === 'floating') {
        commitFloatingRelease(state.currentX, state.currentY);
      } else if (state.mode === 'docked' && state.escaped) {
        onCommit({ placement: 'floating' });
        commitFloatingRelease(state.currentX, state.currentY);
      }
      setDrag(null);
    },
    [commitDockRelease, commitFloatingRelease, onCommit],
  );

  const handleMove = useCallback(
    (event: PointerEvent, active: DragState) => {
      refreshSlotRects();
      const nextState: DragState = {
        ...active,
        currentX: event.clientX,
        currentY: event.clientY,
      };
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
    [refreshSlotRects, surface],
  );

  const handleUp = useCallback(
    (event: PointerEvent, active: DragState) => {
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
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      handleMove(event, drag);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      handleUp(event, drag);
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== drag.pointerId) return;
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [drag, handleMove, handleUp]);

  const onFloatingPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      refreshSlotRects();
      const element = event.currentTarget;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      setDrag({
        mode: 'floating',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        overSlot: null,
        escaped: false,
      });
    },
    [refreshSlotRects],
  );

  const onDockedPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      refreshSlotRects();
      const element = event.currentTarget;
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
        overSlot: null,
        escaped: false,
      });
    },
    [refreshSlotRects],
  );

  const value: GuideCatPlacementContextValue = useMemo(
    () => ({
      guideCat,
      projection,
      dockSlotState,
      pillRef,
      registerSlotRef,
      onFloatingPointerDown,
      onDockedPointerDown,
      presentation,
      dragActive: drag !== null,
    }),
    [
      guideCat,
      projection,
      dockSlotState,
      registerSlotRef,
      onFloatingPointerDown,
      onDockedPointerDown,
      presentation,
      drag,
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

function readSlotRect(node: HTMLElement): GuideCatSlotRect {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export function persistGuideCatPlacementPreference(patch: {
  placement?: GuideCatPlacement;
  floatingAnchor?: GuideCatFloatingAnchor | null;
}): void {
  void fetch('/api/platform/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
    .then((response) => {
      if (response.ok) {
        dispatchPlatformEnvelopeRefresh();
      }
    })
    .catch(() => {});
}
