import type {
  GuideCatFloatingAnchor,
  GuideCatPlacement,
} from '../../shared/platform-contract.js';
import { GUIDE_CAT_FLOATING_ANCHOR_DEFAULT } from '../../shared/platform-contract.js';

export type GuideCatSurfaceClass = 'lobby' | 'workspace' | 'hidden';
export type GuideCatDockSlotKind = 'lobby' | 'workspace';
export type GuideCatPlacementOverrideReason =
  | 'narrow_layout'
  | 'collision_reflow'
  | null;

export interface GuideCatViewportRect {
  width: number;
  height: number;
}

export interface GuideCatSafeArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GuideCatSlotRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function resolveGuideCatSurfaceClass(pathname: string): GuideCatSurfaceClass {
  if (pathname === '/setup' || pathname === '/settings' || pathname.startsWith('/settings/')) {
    return 'hidden';
  }
  if (pathname === '/lobby' || pathname.startsWith('/lobby/')) {
    return 'lobby';
  }
  return 'workspace';
}

const SAFE_AREA_MARGIN = 16;
const FLOATING_PILL_DIAMETER = 28;
const DOCK_CORRIDOR_PADDING = 48;
export const GUIDE_CAT_UNDOCK_ESCAPE_THRESHOLD_PX = 24;

export function resolveGuideCatSafeArea(input: {
  surface: GuideCatSurfaceClass;
  viewport: GuideCatViewportRect;
  topChromeBottom: number | null;
  sidebarRight: number | null;
}): GuideCatSafeArea {
  const { surface, viewport, topChromeBottom, sidebarRight } = input;
  const left = surface === 'workspace' && sidebarRight != null
    ? Math.max(SAFE_AREA_MARGIN, sidebarRight + SAFE_AREA_MARGIN)
    : SAFE_AREA_MARGIN;
  const top = surface === 'lobby' && topChromeBottom != null
    ? Math.max(SAFE_AREA_MARGIN, topChromeBottom + SAFE_AREA_MARGIN)
    : SAFE_AREA_MARGIN;
  return {
    left,
    top,
    right: Math.max(left + FLOATING_PILL_DIAMETER, viewport.width - SAFE_AREA_MARGIN),
    bottom: Math.max(top + FLOATING_PILL_DIAMETER, viewport.height - SAFE_AREA_MARGIN),
  };
}

export function clampFloatingAnchorToSafeArea(input: {
  anchor: GuideCatFloatingAnchor;
  viewport: GuideCatViewportRect;
  safeArea: GuideCatSafeArea;
}): { x: number; y: number } {
  const { anchor, viewport, safeArea } = input;
  const rawX = anchor.x * viewport.width;
  const rawY = anchor.y * viewport.height;
  return {
    x: Math.min(safeArea.right, Math.max(safeArea.left, rawX)),
    y: Math.min(safeArea.bottom, Math.max(safeArea.top, rawY)),
  };
}

export function projectFloatingAnchorToNormalized(input: {
  pointerX: number;
  pointerY: number;
  viewport: GuideCatViewportRect;
}): GuideCatFloatingAnchor {
  const { pointerX, pointerY, viewport } = input;
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { ...GUIDE_CAT_FLOATING_ANCHOR_DEFAULT };
  }
  return {
    x: Math.min(1, Math.max(0, pointerX / viewport.width)),
    y: Math.min(1, Math.max(0, pointerY / viewport.height)),
  };
}

export function resolveEffectiveFloatingAnchor(
  anchor: GuideCatFloatingAnchor | null,
): GuideCatFloatingAnchor {
  return anchor ?? { ...GUIDE_CAT_FLOATING_ANCHOR_DEFAULT };
}

export function isPointerOverSlotCorridor(input: {
  pointerX: number;
  pointerY: number;
  slotRect: GuideCatSlotRect | null;
}): boolean {
  const { pointerX, pointerY, slotRect } = input;
  if (!slotRect) {
    return false;
  }
  return (
    pointerX >= slotRect.left - DOCK_CORRIDOR_PADDING
    && pointerX <= slotRect.right + DOCK_CORRIDOR_PADDING
    && pointerY >= slotRect.top - DOCK_CORRIDOR_PADDING
    && pointerY <= slotRect.bottom + DOCK_CORRIDOR_PADDING
  );
}

export function resolveActiveDockSlot(
  surface: GuideCatSurfaceClass,
): GuideCatDockSlotKind | null {
  if (surface === 'lobby') {
    return 'lobby';
  }
  if (surface === 'workspace') {
    return 'workspace';
  }
  return null;
}

export interface GuideCatFloatingProjection {
  kind: 'floating';
  x: number;
  y: number;
  overrideReason: GuideCatPlacementOverrideReason;
}

export interface GuideCatDockedProjection {
  kind: 'docked';
  slot: GuideCatDockSlotKind;
}

export interface GuideCatHiddenProjection {
  kind: 'hidden';
}

export type GuideCatProjection =
  | GuideCatHiddenProjection
  | GuideCatFloatingProjection
  | GuideCatDockedProjection;

export function resolveGuideCatProjection(input: {
  placement: GuideCatPlacement;
  anchor: GuideCatFloatingAnchor | null;
  surface: GuideCatSurfaceClass;
  viewport: GuideCatViewportRect;
  safeArea: GuideCatSafeArea;
}): GuideCatProjection {
  const { placement, anchor, surface, viewport, safeArea } = input;
  if (surface === 'hidden') {
    return { kind: 'hidden' };
  }
  if (placement === 'docked') {
    const slot = resolveActiveDockSlot(surface);
    if (slot) {
      return { kind: 'docked', slot };
    }
    return { kind: 'hidden' };
  }
  const effective = resolveEffectiveFloatingAnchor(anchor);
  const { x, y } = clampFloatingAnchorToSafeArea({
    anchor: effective,
    viewport,
    safeArea,
  });
  const clampedAnchor = projectFloatingAnchorToNormalized({
    pointerX: x,
    pointerY: y,
    viewport,
  });
  const overrideReason: GuideCatPlacementOverrideReason =
    Math.abs(clampedAnchor.x - effective.x) > 0.001
    || Math.abs(clampedAnchor.y - effective.y) > 0.001
      ? 'collision_reflow'
      : null;
  return {
    kind: 'floating',
    x,
    y,
    overrideReason,
  };
}
