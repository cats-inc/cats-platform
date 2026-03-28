import type { CSSProperties } from 'react';

const SUITE_SURFACE_MENU_WIDTH = 420;
const SUITE_SURFACE_MENU_VIEWPORT_PADDING = 12;
const SUITE_SURFACE_MENU_TRIGGER_GAP = 8;

interface RectLike {
  top: number;
  left: number;
  bottom: number;
}

interface ResolveSuiteSurfaceMenuStyleOptions {
  triggerRect: RectLike;
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  menuHeight: number;
}

export function getPendingSuiteSurfaceMenuStyle(): CSSProperties {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    width: `min(${SUITE_SURFACE_MENU_WIDTH}px, calc(100vw - ${SUITE_SURFACE_MENU_VIEWPORT_PADDING * 2}px))`,
    visibility: 'hidden',
    pointerEvents: 'none',
  };
}

export function resolveSuiteSurfaceMenuWidth(viewportWidth: number): number {
  return Math.max(
    0,
    Math.min(
      SUITE_SURFACE_MENU_WIDTH,
      viewportWidth - SUITE_SURFACE_MENU_VIEWPORT_PADDING * 2,
    ),
  );
}

export function resolveSuiteSurfaceMenuStyle({
  triggerRect,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
}: ResolveSuiteSurfaceMenuStyleOptions): CSSProperties {
  const resolvedWidth = resolveSuiteSurfaceMenuWidth(viewportWidth);
  const measuredWidth = menuWidth || resolvedWidth;

  let left = triggerRect.left;
  if (left + measuredWidth > viewportWidth - SUITE_SURFACE_MENU_VIEWPORT_PADDING) {
    left = Math.max(
      SUITE_SURFACE_MENU_VIEWPORT_PADDING,
      viewportWidth - measuredWidth - SUITE_SURFACE_MENU_VIEWPORT_PADDING,
    );
  }

  let top = triggerRect.bottom + SUITE_SURFACE_MENU_TRIGGER_GAP;
  if (
    menuHeight > 0
    && top + menuHeight > viewportHeight - SUITE_SURFACE_MENU_VIEWPORT_PADDING
  ) {
    top = Math.max(
      SUITE_SURFACE_MENU_VIEWPORT_PADDING,
      triggerRect.top - menuHeight - SUITE_SURFACE_MENU_TRIGGER_GAP,
    );
  }

  return {
    position: 'fixed',
    top,
    left,
    width: resolvedWidth,
  };
}
