import { useCallback, useEffect, useRef, useState } from 'react';

const OUTPUT_WIDTH = 960;
const OUTPUT_HEIGHT = 360;
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 180;

export interface CoverCropDialogProps {
  onSave: (dataUrl: string) => void;
  onClose: () => void;
  title?: string;
  initialDataUrl?: string | null;
}

interface ImageState {
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
}

function clampOffset(state: ImageState, width: number, height: number): { x: number; y: number } {
  const w = state.img.naturalWidth * state.scale;
  const h = state.img.naturalHeight * state.scale;
  return {
    x: Math.min(0, Math.max(width - w, state.x)),
    y: Math.min(0, Math.max(height - h, state.y)),
  };
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  state: ImageState,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  const w = state.img.naturalWidth * state.scale;
  const h = state.img.naturalHeight * state.scale;
  const clamped = clampOffset(state, width, height);
  ctx.drawImage(state.img, clamped.x, clamped.y, w, h);
}

function fitScale(img: HTMLImageElement, width: number, height: number): number {
  return Math.max(width / img.naturalWidth, height / img.naturalHeight);
}

export function CoverCropDialog({
  onSave,
  onClose,
  title = 'Upload cover photo',
  initialDataUrl,
}: CoverCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageState, setImageState] = useState<ImageState | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !imageState) return;
    drawImage(ctx, imageState, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [imageState]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    if (!initialDataUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const scale = fitScale(img, CANVAS_WIDTH, CANVAS_HEIGHT);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      setImageState({
        img,
        x: (CANVAS_WIDTH - w) / 2,
        y: (CANVAS_HEIGHT - h) / 2,
        scale,
      });
    };
    img.src = initialDataUrl;
    return () => {
      cancelled = true;
    };
  }, [initialDataUrl]);

  function handleFile(file: File): void {
    if (!file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      const scale = fitScale(img, CANVAS_WIDTH, CANVAS_HEIGHT);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      setImageState({
        img,
        x: (CANVAS_WIDTH - w) / 2,
        y: (CANVAS_HEIGHT - h) / 2,
        scale,
      });
    };
    img.src = URL.createObjectURL(file);
  }

  function handleMouseDown(e: React.MouseEvent): void {
    if (!imageState) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: imageState.x,
      origY: imageState.y,
    };

    function onMove(ev: MouseEvent): void {
      if (!dragRef.current) return;
      const { startX, startY, origX, origY } = dragRef.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setImageState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, x: origX + dx, y: origY + dy };
        const clamped = clampOffset(next, CANVAS_WIDTH, CANVAS_HEIGHT);
        return { ...next, ...clamped };
      });
    }

    function onUp(): void {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    function onWheel(ev: WheelEvent): void {
      ev.preventDefault();
      const delta = ev.deltaY > 0 ? 0.95 : 1.05;
      setImageState((prev) => {
        if (!prev) return prev;
        const minScale = fitScale(prev.img, CANVAS_WIDTH, CANVAS_HEIGHT);
        const newScale = Math.max(minScale, Math.min(prev.scale * delta, minScale * 5));
        const cx = CANVAS_WIDTH / 2;
        const cy = CANVAS_HEIGHT / 2;
        const newX = cx - (cx - prev.x) * (newScale / prev.scale);
        const newY = cy - (cy - prev.y) * (newScale / prev.scale);
        const next = { ...prev, scale: newScale, x: newX, y: newY };
        const clamped = clampOffset(next, CANVAS_WIDTH, CANVAS_HEIGHT);
        return { ...next, ...clamped };
      });
    }
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [imageState == null]);

  function handleSave(): void {
    if (!imageState) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUTPUT_WIDTH;
    outCanvas.height = OUTPUT_HEIGHT;
    const ctx = outCanvas.getContext('2d')!;
    const scaleUp = OUTPUT_WIDTH / CANVAS_WIDTH;
    const highResState: ImageState = {
      img: imageState.img,
      x: imageState.x * scaleUp,
      y: imageState.y * scaleUp,
      scale: imageState.scale * scaleUp,
    };
    drawImage(ctx, highResState, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    onSave(outCanvas.toDataURL('image/jpeg', 0.85));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="avatarCropOverlay" onClick={onClose}>
      <div
        className="avatarCropDialog coverCropDialog"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="avatarCropTitle">{title}</p>
        {imageState ? (
          <>
            <div
              ref={wrapRef}
              className="avatarCropCanvasWrap coverCropCanvasWrap"
              onMouseDown={handleMouseDown}
            >
              <canvas
                ref={canvasRef}
                className="avatarCropCanvas coverCropCanvas"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
              />
            </div>
            <p className="avatarCropHint">Drag to reposition, scroll to zoom</p>
          </>
        ) : (
          <div
            className="avatarCropUploadArea coverCropUploadArea"
            onClick={() => fileInputRef.current?.click()}
          >
            Click to choose image
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="avatarCropActions">
          <button
            className="confirmCancelButton"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          {imageState ? (
            <button
              className="primaryButton"
              type="button"
              onClick={handleSave}
            >
              Apply
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
