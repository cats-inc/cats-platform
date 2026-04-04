import type { CSSProperties } from 'react';

const PLATFORM_SURFACE_MENU_WIDTH = 420;
const PLATFORM_SURFACE_MENU_VIEWPORT_PADDING = 12;
const PLATFORM_SURFACE_MENU_TRIGGER_GAP = 8;

interface RectLike {
  top: number;
  left: number;
  bottom: number;
}

interface ResolvePlatformSurfaceMenuStyleOptions {
  triggerRect: RectLike;
  viewportWidth: number;
  viewportHeight: number;
  menuWidth: number;
  menuHeight: number;
}

export function getPendingPlatformSurfaceMenuStyle(): CSSProperties {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    width: `min(${PLATFORM_SURFACE_MENU_WIDTH}px, calc(100vw - ${PLATFORM_SURFACE_MENU_VIEWPORT_PADDING * 2}px))`,
    visibility: 'hidden',
    pointerEvents: 'none',
  };
}

export function resolvePlatformSurfaceMenuWidth(viewportWidth: number): number {
  return Math.max(
    0,
    Math.min(
      PLATFORM_SURFACE_MENU_WIDTH,
      viewportWidth - PLATFORM_SURFACE_MENU_VIEWPORT_PADDING * 2,
    ),
  );
}

export function resolvePlatformSurfaceMenuStyle({
  triggerRect,
  viewportWidth,
  viewportHeight,
  menuWidth,
  menuHeight,
}: ResolvePlatformSurfaceMenuStyleOptions): CSSProperties {
  const resolvedWidth = resolvePlatformSurfaceMenuWidth(viewportWidth);
  const measuredWidth = menuWidth || resolvedWidth;

  let left = triggerRect.left;
  if (left + measuredWidth > viewportWidth - PLATFORM_SURFACE_MENU_VIEWPORT_PADDING) {
    left = Math.max(
      PLATFORM_SURFACE_MENU_VIEWPORT_PADDING,
      viewportWidth - measuredWidth - PLATFORM_SURFACE_MENU_VIEWPORT_PADDING,
    );
  }

  let top = triggerRect.bottom + PLATFORM_SURFACE_MENU_TRIGGER_GAP;
  if (
    menuHeight > 0
    && top + menuHeight > viewportHeight - PLATFORM_SURFACE_MENU_VIEWPORT_PADDING
  ) {
    top = Math.max(
      PLATFORM_SURFACE_MENU_VIEWPORT_PADDING,
      triggerRect.top - menuHeight - PLATFORM_SURFACE_MENU_TRIGGER_GAP,
    );
  }

  return {
    position: 'fixed',
    top,
    left,
    width: resolvedWidth,
  };
}
