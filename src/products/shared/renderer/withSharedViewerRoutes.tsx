import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Outlet,
  Route,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom';

import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { useI18n } from '../../../app/renderer/i18n/index.js';
import {
  canvasSurfaceRouteRegistry,
  type CanvasSurfaceKind,
  type CanvasSurfaceRef,
} from '../artifactCanvas/contracts.js';
import { CanvasPane } from './CanvasPane.js';
import { useCanvasNavigateIntent } from './useCanvasNavigateIntent.js';

export interface SharedViewerRoutesInput {
  key: string;
  path: string;
  surfaceKind: CanvasSurfaceKind;
  surfaceIdParam: string;
  element: ReactNode;
}

export interface ArtifactCanvasSurfaceOutletContext {
  surface: CanvasSurfaceRef;
  parentUrl: string;
}

const ARTIFACT_CANVAS_PANE_WIDTH_DEFAULT = 460;
const ARTIFACT_CANVAS_PANE_WIDTH_MIN = 320;
const ARTIFACT_CANVAS_PANE_WIDTH_MAX = 760;
const ARTIFACT_CANVAS_MAIN_WIDTH_MIN = 360;
const ARTIFACT_CANVAS_PANE_WIDTH_STEP = 32;
const ARTIFACT_CANVAS_PANE_WIDTH_LARGE_STEP = 80;

export function withSharedViewerRoutes(input: SharedViewerRoutesInput): ReactElement {
  return (
    <Route
      key={input.key}
      path={input.path}
      element={
        <SharedViewerSurfaceFrame
          surfaceKind={input.surfaceKind}
          surfaceIdParam={input.surfaceIdParam}
        >
          {input.element}
        </SharedViewerSurfaceFrame>
      }
    >
      <Route path="canvas/:artifactId" element={<CanvasPane />} />
      <Route path="canvas/:artifactId/view/:presentation" element={<CanvasPane />} />
    </Route>
  );
}

export function useArtifactCanvasSurfaceOutletContext(): ArtifactCanvasSurfaceOutletContext {
  return useOutletContext<ArtifactCanvasSurfaceOutletContext>();
}

function SharedViewerSurfaceFrame({
  surfaceKind,
  surfaceIdParam,
  children,
}: {
  surfaceKind: CanvasSurfaceKind;
  surfaceIdParam: string;
  children: ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  const params = useParams();
  const location = useLocation();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const surfaceId = params[surfaceIdParam];
  const surface = useMemo<CanvasSurfaceRef | null>(
    () => surfaceId ? { kind: surfaceKind, surfaceId } : null,
    [surfaceId, surfaceKind],
  );
  useCanvasNavigateIntent(surface);
  const canvasRoute = surface
    ? canvasSurfaceRouteRegistry.parse(location.pathname)
    : null;
  const hasCanvasPane = Boolean(
    surface
    && canvasRoute?.kind === 'canvas'
    && canvasRoute.surface.kind === surface.kind
    && canvasRoute.surface.surfaceId === surface.surfaceId,
  );
  const surfacePreferenceKey = surface ? paneWidthStorageKey(surface) : null;
  const [paneWidth, setPaneWidth] = useState(ARTIFACT_CANVAS_PANE_WIDTH_DEFAULT);
  const [loadedPreferenceKey, setLoadedPreferenceKey] = useState<string | null>(null);

  useEffect(() => {
    if (!surface) {
      setLoadedPreferenceKey(null);
      setPaneWidth(ARTIFACT_CANVAS_PANE_WIDTH_DEFAULT);
      return;
    }
    setPaneWidth(readPaneWidthPreference(surface));
    setLoadedPreferenceKey(paneWidthStorageKey(surface));
  }, [surface]);

  useEffect(() => {
    if (!surface || !hasCanvasPane || loadedPreferenceKey !== surfacePreferenceKey) {
      return;
    }
    writePaneWidthPreference(surface, paneWidth);
  }, [hasCanvasPane, loadedPreferenceKey, paneWidth, surface, surfacePreferenceKey]);

  const maxPaneWidth = useMemo(
    () => resolveMaxPaneWidth(frameRef.current),
    [hasCanvasPane],
  );
  const resizeBy = useCallback((delta: number) => {
    const maxWidth = resolveMaxPaneWidth(frameRef.current);
    setPaneWidth((current) => clampPaneWidth(current + delta, maxWidth));
  }, []);
  const handleResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey
      ? ARTIFACT_CANVAS_PANE_WIDTH_LARGE_STEP
      : ARTIFACT_CANVAS_PANE_WIDTH_STEP;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      resizeBy(step);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      resizeBy(-step);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setPaneWidth(ARTIFACT_CANVAS_PANE_WIDTH_MIN);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setPaneWidth(resolveMaxPaneWidth(frameRef.current));
    }
  }, [resizeBy]);
  const handleResizePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const frame = frameRef.current;
    if (!frame || typeof window === 'undefined') {
      return;
    }

    event.preventDefault();
    const rect = frame.getBoundingClientRect();
    const maxWidth = resolveMaxPaneWidth(frame);
    const updateWidth = (clientX: number) => {
      setPaneWidth(clampPaneWidth(rect.right - clientX, maxWidth));
    };
    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      updateWidth(pointerEvent.clientX);
    };
    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    updateWidth(event.clientX);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }, []);

  if (!surface) {
    return <>{children}</>;
  }

  const parentUrl = canvasSurfaceRouteRegistry.parentUrl(surface);
  if (!hasCanvasPane) {
    return <>{children}</>;
  }

  const frameStyle = {
    '--artifact-canvas-pane-width': `${paneWidth}px`,
  } as CSSProperties & Record<'--artifact-canvas-pane-width', string>;

  return (
    <div className="artifactCanvasSurfaceFrame" ref={frameRef} style={frameStyle}>
      <div className="artifactCanvasSurfaceMain">
        {children}
      </div>
      <div
        className="artifactCanvasResizeHandle"
        role="separator"
        aria-label={t(messageKeys.sharedArtifactCanvasResizePane)}
        aria-orientation="vertical"
        aria-valuemin={ARTIFACT_CANVAS_PANE_WIDTH_MIN}
        aria-valuemax={maxPaneWidth}
        aria-valuenow={paneWidth}
        tabIndex={0}
        onKeyDown={handleResizeKeyDown}
        onPointerDown={handleResizePointerDown}
      />
      <Outlet context={{ surface, parentUrl } satisfies ArtifactCanvasSurfaceOutletContext} />
    </div>
  );
}

function readPaneWidthPreference(surface: CanvasSurfaceRef): number {
  if (typeof window === 'undefined') {
    return ARTIFACT_CANVAS_PANE_WIDTH_DEFAULT;
  }
  const raw = window.localStorage.getItem(paneWidthStorageKey(surface));
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed)
    ? clampPaneWidth(parsed, ARTIFACT_CANVAS_PANE_WIDTH_MAX)
    : ARTIFACT_CANVAS_PANE_WIDTH_DEFAULT;
}

function writePaneWidthPreference(surface: CanvasSurfaceRef, width: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(paneWidthStorageKey(surface), String(width));
}

function paneWidthStorageKey(surface: CanvasSurfaceRef): string {
  return `cats.artifactCanvas.paneWidth.${surface.kind}.${surface.surfaceId}`;
}

function resolveMaxPaneWidth(frame: HTMLElement | null): number {
  if (!frame) {
    return ARTIFACT_CANVAS_PANE_WIDTH_MAX;
  }
  return Math.max(
    ARTIFACT_CANVAS_PANE_WIDTH_MIN,
    Math.min(
      ARTIFACT_CANVAS_PANE_WIDTH_MAX,
      frame.clientWidth - ARTIFACT_CANVAS_MAIN_WIDTH_MIN,
    ),
  );
}

function clampPaneWidth(width: number, maxWidth: number): number {
  return Math.min(
    Math.max(Math.round(width), ARTIFACT_CANVAS_PANE_WIDTH_MIN),
    maxWidth,
  );
}
