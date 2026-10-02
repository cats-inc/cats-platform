import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Main window size and position.
 *
 * The window reopens where the user left it. Without a usable saved placement
 * (first launch, or the saved display is gone) the size derives from the work
 * area of the primary display: 85% of it, kept between a floor and a cap. When
 * even the floor does not fit, the window opens maximized with a smaller normal
 * size behind it, so Restore still has somewhere to go.
 */

export interface DesktopWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesktopWindowPlacement {
  /** Normal-state bounds, which are also what leaving maximized restores to. */
  bounds: DesktopWindowRect;
  maximized: boolean;
}

interface DesktopWindowSize {
  width: number;
  height: number;
}

export const DESKTOP_MAIN_WINDOW_MIN_SIZE: Readonly<DesktopWindowSize> = { width: 960, height: 600 };
const DEFAULT_WORK_AREA_FRACTION = 0.85;
const DEFAULT_SIZE_FLOOR: Readonly<DesktopWindowSize> = { width: 1280, height: 800 };
const DEFAULT_SIZE_CAP: Readonly<DesktopWindowSize> = { width: 1680, height: 1050 };
const DESKTOP_WINDOW_STATE_VERSION = 1;
const DEFAULT_SAVE_DEBOUNCE_MS = 500;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function centerInWorkArea(workArea: DesktopWindowRect, size: DesktopWindowSize): DesktopWindowRect {
  return {
    x: workArea.x + Math.floor((workArea.width - size.width) / 2),
    y: workArea.y + Math.floor((workArea.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

export function resolveDefaultDesktopWindowPlacement(
  workArea: DesktopWindowRect,
): DesktopWindowPlacement {
  if (workArea.width < DEFAULT_SIZE_FLOOR.width || workArea.height < DEFAULT_SIZE_FLOOR.height) {
    const fraction = (length: number, min: number) => Math.min(
      length,
      Math.max(min, Math.round(length * DEFAULT_WORK_AREA_FRACTION)),
    );
    return {
      bounds: centerInWorkArea(workArea, {
        width: fraction(workArea.width, DESKTOP_MAIN_WINDOW_MIN_SIZE.width),
        height: fraction(workArea.height, DESKTOP_MAIN_WINDOW_MIN_SIZE.height),
      }),
      maximized: true,
    };
  }

  return {
    bounds: centerInWorkArea(workArea, {
      width: clamp(
        Math.round(workArea.width * DEFAULT_WORK_AREA_FRACTION),
        DEFAULT_SIZE_FLOOR.width,
        DEFAULT_SIZE_CAP.width,
      ),
      height: clamp(
        Math.round(workArea.height * DEFAULT_WORK_AREA_FRACTION),
        DEFAULT_SIZE_FLOOR.height,
        DEFAULT_SIZE_CAP.height,
      ),
    }),
    maximized: false,
  };
}

function intersectionArea(a: DesktopWindowRect, b: DesktopWindowRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Places saved bounds on the display they overlap most and pulls them fully
 * inside its work area. Returns null when they overlap no current display.
 */
export function resolveRestoredDesktopWindowPlacement(
  saved: DesktopWindowPlacement,
  workAreas: readonly DesktopWindowRect[],
): DesktopWindowPlacement | null {
  let target: DesktopWindowRect | null = null;
  let targetArea = 0;
  for (const workArea of workAreas) {
    const area = intersectionArea(saved.bounds, workArea);
    if (area > targetArea) {
      target = workArea;
      targetArea = area;
    }
  }
  if (!target) {
    return null;
  }

  const width = Math.min(saved.bounds.width, target.width);
  const height = Math.min(saved.bounds.height, target.height);
  return {
    bounds: {
      x: clamp(saved.bounds.x, target.x, target.x + target.width - width),
      y: clamp(saved.bounds.y, target.y, target.y + target.height - height),
      width,
      height,
    },
    maximized: saved.maximized,
  };
}

export function resolveDesktopWindowPlacement(input: {
  saved: DesktopWindowPlacement | null;
  workAreas: readonly DesktopWindowRect[];
  primaryWorkArea: DesktopWindowRect;
}): DesktopWindowPlacement {
  return (input.saved && resolveRestoredDesktopWindowPlacement(input.saved, input.workAreas))
    ?? resolveDefaultDesktopWindowPlacement(input.primaryWorkArea);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Accepts only the current version; anything else falls back to the default placement. */
export function parseDesktopWindowState(value: unknown): DesktopWindowPlacement | null {
  if (
    !isObjectRecord(value)
    || value.version !== DESKTOP_WINDOW_STATE_VERSION
    || !isObjectRecord(value.bounds)
  ) {
    return null;
  }
  const { x, y, width, height } = value.bounds;
  if (
    typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)
    || typeof width !== 'number' || !Number.isFinite(width) || width <= 0
    || typeof height !== 'number' || !Number.isFinite(height) || height <= 0
  ) {
    return null;
  }
  return {
    bounds: {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    },
    maximized: value.maximized === true,
  };
}

export function readDesktopWindowState(statePath: string): DesktopWindowPlacement | null {
  try {
    return parseDesktopWindowState(JSON.parse(readFileSync(statePath, 'utf8')) as unknown);
  } catch {
    return null;
  }
}

/** Writes synchronously and atomically, so a save on the way to exit always lands whole. */
export function writeDesktopWindowState(statePath: string, placement: DesktopWindowPlacement): void {
  mkdirSync(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify({
    version: DESKTOP_WINDOW_STATE_VERSION,
    bounds: placement.bounds,
    maximized: placement.maximized,
  }, null, 2)}\n`);
  renameSync(tempPath, statePath);
}

export interface DesktopPlacementWindow {
  getNormalBounds(): DesktopWindowRect;
  isMaximized(): boolean;
  isMinimized(): boolean;
  isFullScreen(): boolean;
  isDestroyed(): boolean;
  on(event: string, listener: () => void): unknown;
}

export interface DesktopWindowPlacementTracker {
  /** Writes pending changes now; a no-op when nothing changed since the last write. */
  flush(): void;
}

/**
 * Saves the window's placement after it stops moving or resizing. Nothing is
 * written until the window actually changes, so a window that never showed
 * keeps the saved placement it was opened with.
 */
export function trackDesktopWindowPlacement(
  window: DesktopPlacementWindow,
  options: {
    statePath: string;
    /** The maximized state the window was opened with, applied when it first shows. */
    maximized: boolean;
    debounceMs?: number;
    writeState?: (statePath: string, placement: DesktopWindowPlacement) => void;
  },
): DesktopWindowPlacementTracker {
  const writeState = options.writeState ?? writeDesktopWindowState;
  const debounceMs = options.debounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS;
  // Minimized and full-screen windows do not report whether they will return
  // maximized, so remember the last maximized state the window announced.
  let maximized = options.maximized;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty || window.isDestroyed()) {
      return;
    }
    dirty = false;
    if (!window.isMinimized() && !window.isFullScreen()) {
      maximized = window.isMaximized();
    }
    try {
      writeState(options.statePath, { bounds: window.getNormalBounds(), maximized });
    } catch (error) {
      process.stderr.write(
        `Desktop window state save failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  };

  const markChanged = () => {
    dirty = true;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, debounceMs);
    timer.unref?.();
  };

  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) {
    window.on(event, markChanged);
  }
  window.on('maximize', () => {
    maximized = true;
  });
  window.on('unmaximize', () => {
    // Some platforms report minimizing a maximized window as unmaximize.
    if (!window.isMinimized()) {
      maximized = false;
    }
  });
  window.on('close', flush);

  return { flush };
}
