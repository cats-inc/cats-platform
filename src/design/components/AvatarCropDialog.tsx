import { useCallback, useEffect, useRef, useState } from 'react';

const OUTPUT_SIZE = 256;

export interface AvatarCropDialogProps {
  onSave: (dataUrl: string) => void;
  onClose: () => void;
  initialDataUrl?: string | null;
}

interface ImageState {
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
}

function clampOffset(state: ImageState, canvasSize: number): { x: number; y: number } {
  const w = state.img.naturalWidth * state.scale;
  const h = state.img.naturalHeight * state.scale;
  const minX = canvasSize - w;
  const minY = canvasSize - h;
  return {
    x: Math.min(0, Math.max(minX, state.x)),
    y: Math.min(0, Math.max(minY, state.y)),
  };
}

function drawImage(ctx: CanvasRenderingContext2D, state: ImageState, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const w = state.img.naturalWidth * state.scale;
  const h = state.img.naturalHeight * state.scale;
  const clamped = clampOffset(state, size);
  ctx.drawImage(state.img, clamped.x, clamped.y, w, h);
}

function fitScale(img: HTMLImageElement, canvasSize: number): number {
  const minDim = Math.min(img.naturalWidth, img.naturalHeight);
  return canvasSize / minDim;
}

export function AvatarCropDialog({ onSave, onClose, initialDataUrl }: AvatarCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageState, setImageState] = useState<ImageState | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !imageState) return;
    drawImage(ctx, imageState, OUTPUT_SIZE);
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
      const scale = fitScale(img, OUTPUT_SIZE);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      setImageState({
        img,
        x: (OUTPUT_SIZE - w) / 2,
        y: (OUTPUT_SIZE - h) / 2,
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
      const scale = fitScale(img, OUTPUT_SIZE);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      setImageState({
        img,
        x: (OUTPUT_SIZE - w) / 2,
        y: (OUTPUT_SIZE - h) / 2,
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
        const clamped = clampOffset(next, OUTPUT_SIZE);
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
        const minScale = fitScale(prev.img, OUTPUT_SIZE);
        const newScale = Math.max(minScale, Math.min(prev.scale * delta, minScale * 5));
        const cx = OUTPUT_SIZE / 2;
        const cy = OUTPUT_SIZE / 2;
        const newX = cx - (cx - prev.x) * (newScale / prev.scale);
        const newY = cy - (cy - prev.y) * (newScale / prev.scale);
        const next = { ...prev, scale: newScale, x: newX, y: newY };
        const clamped = clampOffset(next, OUTPUT_SIZE);
        return { ...next, ...clamped };
      });
    }
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [imageState == null]);

  function handleSave(): void {
    const canvas = canvasRef.current;
    if (!canvas || !imageState) return;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const ctx = outCanvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    drawImage(ctx, imageState, OUTPUT_SIZE);
    onSave(outCanvas.toDataURL('image/png'));
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
      <div className="avatarCropDialog" onClick={(e) => e.stopPropagation()}>
        <p className="avatarCropTitle">Upload avatar</p>
        {imageState ? (
          <>
            <div
              ref={wrapRef}
              className="avatarCropCanvasWrap"
              onMouseDown={handleMouseDown}
            >
              <canvas
                ref={canvasRef}
                className="avatarCropCanvas"
                width={OUTPUT_SIZE}
                height={OUTPUT_SIZE}
              />
            </div>
            <p className="avatarCropHint">Drag to reposition, scroll to zoom</p>
          </>
        ) : (
          <div
            className="avatarCropUploadArea"
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
