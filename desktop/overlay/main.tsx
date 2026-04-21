import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';

import type {
  DesktopScreenshotOverlaySnapshotPayload,
} from '../host/screenshotOverlayPayload.js';
import type {
  DesktopScreenshotOverlaySelectionState,
} from '../host/screenshotOverlaySelection.js';
import {
  beginScreenshotOverlayDrag,
  cancelScreenshotOverlaySelection,
  completeScreenshotOverlaySelection,
  createIdleScreenshotOverlaySelection,
  updateScreenshotOverlayDrag,
} from '../host/screenshotOverlaySelection.js';
import {
  mapCssSelectionToPhysicalCropRect,
  normalizeDesktopScreenshotCssRect,
} from '../host/screenshotGeometry.js';
import './styles.css';

interface ScreenshotOverlaySelectionResult {
  displayId: number;
  cssRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cropRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ScreenshotOverlayBridge {
  getSnapshot(): Promise<DesktopScreenshotOverlaySnapshotPayload>;
  completeSelection(result: ScreenshotOverlaySelectionResult): Promise<void>;
  cancel(reason: string): Promise<void>;
}

declare global {
  interface Window {
    catsScreenshotOverlay?: ScreenshotOverlayBridge;
  }
}

function toGlobalPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  payload: DesktopScreenshotOverlaySnapshotPayload,
) {
  return {
    x: payload.bounds.x + event.clientX,
    y: payload.bounds.y + event.clientY,
  };
}

function resolveSelectionRect(
  state: DesktopScreenshotOverlaySelectionState,
  payload: DesktopScreenshotOverlaySnapshotPayload,
) {
  if (state.phase === 'dragging') {
    const cssRect = normalizeDesktopScreenshotCssRect(state.anchor, state.current);
    return {
      cssRect,
      cropRect: mapCssSelectionToPhysicalCropRect(cssRect, {
        bounds: payload.bounds,
        imageSize: payload.imageSize,
        scaleFactor: payload.scaleFactor,
      }),
    };
  }

  if (state.phase === 'selected') {
    return {
      cssRect: state.cssRect,
      cropRect: state.cropRect,
    };
  }

  return null;
}

function relativeRectStyle(
  cssRect: ScreenshotOverlaySelectionResult['cssRect'],
  payload: DesktopScreenshotOverlaySnapshotPayload,
): React.CSSProperties {
  return {
    left: cssRect.x - payload.bounds.x,
    top: cssRect.y - payload.bounds.y,
    width: cssRect.width,
    height: cssRect.height,
  };
}

function ScreenshotOverlay() {
  const [payload, setPayload] = useState<DesktopScreenshotOverlaySnapshotPayload | null>(null);
  const [selection, setSelection] = useState<DesktopScreenshotOverlaySelectionState>(
    createIdleScreenshotOverlaySelection(),
  );
  const bridge = window.catsScreenshotOverlay;

  useEffect(() => {
    let cancelled = false;
    void bridge?.getSnapshot().then((nextPayload) => {
      if (!cancelled) {
        setPayload(nextPayload);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelection(cancelScreenshotOverlaySelection('escape'));
        void bridge?.cancel('escape');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [bridge]);

  const activeSelection = useMemo(
    () => payload ? resolveSelectionRect(selection, payload) : null,
    [payload, selection],
  );

  if (!payload) {
    return <div className="screenshotOverlay" />;
  }

  return (
    <div
      className="screenshotOverlay"
      style={{ backgroundImage: `url("${payload.imageDataUrl}")` }}
      onContextMenu={(event) => {
        event.preventDefault();
        setSelection(cancelScreenshotOverlaySelection('right_click'));
        void bridge?.cancel('right_click');
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          setSelection(cancelScreenshotOverlaySelection('right_click'));
          void bridge?.cancel('right_click');
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        setSelection(beginScreenshotOverlayDrag(toGlobalPoint(event.nativeEvent, payload)));
      }}
      onPointerMove={(event) => {
        setSelection((current) =>
          updateScreenshotOverlayDrag(current, toGlobalPoint(event.nativeEvent, payload)));
      }}
      onPointerUp={(event) => {
        const nextSelection = completeScreenshotOverlaySelection(
          selection,
          toGlobalPoint(event.nativeEvent, payload),
          {
            bounds: payload.bounds,
            imageSize: payload.imageSize,
            scaleFactor: payload.scaleFactor,
          },
        );
        setSelection(nextSelection);
        if (nextSelection.phase === 'selected') {
          void bridge?.completeSelection({
            displayId: payload.displayId,
            cssRect: nextSelection.cssRect,
            cropRect: nextSelection.cropRect,
          });
          return;
        }
        if (nextSelection.phase === 'cancelled') {
          void bridge?.cancel(nextSelection.reason);
        }
      }}
    >
      {activeSelection ? (
        <>
          <div
            className="screenshotSelectionRect"
            style={relativeRectStyle(activeSelection.cssRect, payload)}
          />
          <div
            className="screenshotSelectionSize"
            style={{
              left: activeSelection.cssRect.x - payload.bounds.x + activeSelection.cssRect.width,
              top: activeSelection.cssRect.y - payload.bounds.y + activeSelection.cssRect.height,
            }}
          >
            {activeSelection.cropRect.width}x{activeSelection.cropRect.height}
          </div>
        </>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ScreenshotOverlay />
  </React.StrictMode>,
);
