import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';

import type {
  DesktopScreenshotOverlaySnapshotPayload,
} from '../host/screenshotOverlayPayload.js';
import type {
  DesktopScreenshotOverlayBridge,
} from '../host/screenshotOverlayIpc.js';
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
  type DesktopScreenshotCssRect,
} from '../host/screenshotGeometry.js';
import './styles.css';

declare global {
  interface Window {
    catsScreenshotOverlay?: DesktopScreenshotOverlayBridge;
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
  cssRect: DesktopScreenshotCssRect,
  payload: DesktopScreenshotOverlaySnapshotPayload,
): React.CSSProperties {
  return {
    left: cssRect.x - payload.bounds.x,
    top: cssRect.y - payload.bounds.y,
    width: cssRect.width,
    height: cssRect.height,
  };
}

interface PendingScreenshotOverlayDrag {
  anchor: { clientX: number; clientY: number };
  current: { clientX: number; clientY: number };
}

function ScreenshotOverlay() {
  const [payload, setPayload] = useState<DesktopScreenshotOverlaySnapshotPayload | null>(null);
  const [selection, setSelection] = useState<DesktopScreenshotOverlaySelectionState>(
    createIdleScreenshotOverlaySelection(),
  );
  // Buffer a pointerdown that lands before the snapshot payload has arrived so
  // the user's first drag isn't dropped against an empty overlay. Updated on
  // every pre-payload pointermove and replayed when payload finally resolves.
  const pendingDragRef = useRef<PendingScreenshotOverlayDrag | null>(null);
  const bridge = window.catsScreenshotOverlay;
  const displayId = useMemo(() => {
    const rawDisplayId = new URLSearchParams(window.location.search).get('displayId');
    const parsed = Number.parseInt(rawDisplayId ?? '', 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (displayId === null) {
      return () => {
        cancelled = true;
      };
    }
    void bridge?.getSnapshot(displayId).then((nextPayload) => {
      if (!cancelled) {
        setPayload(nextPayload);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, displayId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pendingDragRef.current = null;
        setSelection(cancelScreenshotOverlaySelection('escape'));
        void bridge?.cancel('escape');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [bridge]);

  // Promote any buffered pre-payload drag into the real selection state once
  // the snapshot is available. Replays both anchor and the latest move so the
  // rect lands at the user's current cursor instead of snapping to the click.
  useEffect(() => {
    if (!payload) {
      return;
    }
    const pending = pendingDragRef.current;
    if (!pending) {
      return;
    }
    pendingDragRef.current = null;
    let nextSelection = beginScreenshotOverlayDrag({
      x: payload.bounds.x + pending.anchor.clientX,
      y: payload.bounds.y + pending.anchor.clientY,
    });
    if (
      pending.current.clientX !== pending.anchor.clientX
      || pending.current.clientY !== pending.anchor.clientY
    ) {
      nextSelection = updateScreenshotOverlayDrag(nextSelection, {
        x: payload.bounds.x + pending.current.clientX,
        y: payload.bounds.y + pending.current.clientY,
      });
    }
    setSelection(nextSelection);
  }, [payload]);

  const activeSelection = useMemo(
    () => payload ? resolveSelectionRect(selection, payload) : null,
    [payload, selection],
  );
  // Hold the multi-MB data URL string outside the per-render inline style so
  // pointermove re-renders don't rebuild and re-diff it on every drag tick.
  const overlayBackgroundStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!payload) {
      return undefined;
    }
    return {
      backgroundImage: `url("${payload.imageDataUrl}")`,
      backgroundSize: `${payload.bounds.width}px ${payload.bounds.height}px`,
    };
  }, [payload]);

  return (
    <div
      className="screenshotOverlay"
      style={overlayBackgroundStyle}
      onContextMenu={(event) => {
        event.preventDefault();
        pendingDragRef.current = null;
        if (payload) {
          setSelection(cancelScreenshotOverlaySelection('right_click'));
        }
        void bridge?.cancel('right_click');
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          pendingDragRef.current = null;
          if (payload) {
            setSelection(cancelScreenshotOverlaySelection('right_click'));
          }
          void bridge?.cancel('right_click');
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        if (!payload) {
          const anchor = {
            clientX: event.nativeEvent.clientX,
            clientY: event.nativeEvent.clientY,
          };
          pendingDragRef.current = { anchor, current: { ...anchor } };
          return;
        }
        setSelection(beginScreenshotOverlayDrag(toGlobalPoint(event.nativeEvent, payload)));
      }}
      onPointerMove={(event) => {
        if (!payload) {
          if (pendingDragRef.current) {
            pendingDragRef.current.current = {
              clientX: event.nativeEvent.clientX,
              clientY: event.nativeEvent.clientY,
            };
          }
          return;
        }
        setSelection((current) =>
          updateScreenshotOverlayDrag(current, toGlobalPoint(event.nativeEvent, payload)));
      }}
      onPointerUp={(event) => {
        if (!payload) {
          // Released before the snapshot arrived. Drop the buffered drag —
          // the user can click again once the overlay is fully painted.
          pendingDragRef.current = null;
          return;
        }
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
      {payload && activeSelection ? (
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
            {`${activeSelection.cropRect.width}x${activeSelection.cropRect.height}`}
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
