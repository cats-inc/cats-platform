import { useEffect, useRef } from 'react';

import { nameInitials } from '../../shared/nameInitials.js';
import type {
  PlatformLobbyAnimationMode,
  PlatformLobbyCatSummary,
} from '../../shared/platform-contract.js';

interface BouncingCat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  initials: string;
  isBoss: boolean;
  image: HTMLImageElement | null;
}

const RADIUS = 14;
const BASE_SPEED = 0.6;
const OPACITY = 0.18;
const REDUCED_MOTION_SPEED_MULTIPLIER = 0.18;
const BOSS_RING_WIDTH = 2;
const BOSS_RING_COLOR = '#e8c84a';
const FALLBACK_COLOR = '#8B7E74';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function initCats(
  cats: PlatformLobbyCatSummary[],
  width: number,
  height: number,
): BouncingCat[] {
  return cats.map((cat) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = BASE_SPEED + Math.random() * 0.3;
    return {
      x: RADIUS + Math.random() * (width - RADIUS * 2),
      y: RADIUS + Math.random() * (height - RADIUS * 2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: cat.avatarColor ?? FALLBACK_COLOR,
      initials: nameInitials(cat.name),
      isBoss: cat.isBoss,
      image: null,
    };
  });
}

function tick(cats: BouncingCat[], width: number, height: number, multiplier: number): void {
  for (const cat of cats) {
    cat.x += cat.vx * multiplier;
    cat.y += cat.vy * multiplier;

    if (cat.x - RADIUS <= 0) {
      cat.x = RADIUS;
      cat.vx = Math.abs(cat.vx);
    } else if (cat.x + RADIUS >= width) {
      cat.x = width - RADIUS;
      cat.vx = -Math.abs(cat.vx);
    }

    if (cat.y - RADIUS <= 0) {
      cat.y = RADIUS;
      cat.vy = Math.abs(cat.vy);
    } else if (cat.y + RADIUS >= height) {
      cat.y = height - RADIUS;
      cat.vy = -Math.abs(cat.vy);
    }
  }
}

function clampCats(cats: BouncingCat[], width: number, height: number): void {
  for (const cat of cats) {
    cat.x = Math.min(Math.max(RADIUS, cat.x), width - RADIUS);
    cat.y = Math.min(Math.max(RADIUS, cat.y), height - RADIUS);
  }
}

function drawCats(
  ctx: CanvasRenderingContext2D,
  cats: readonly BouncingCat[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);

  for (const cat of cats) {
    ctx.globalAlpha = OPACITY;

    // boss ring
    if (cat.isBoss) {
      ctx.beginPath();
      ctx.arc(cat.x, cat.y, RADIUS + BOSS_RING_WIDTH, 0, Math.PI * 2);
      ctx.strokeStyle = BOSS_RING_COLOR;
      ctx.lineWidth = BOSS_RING_WIDTH;
      ctx.stroke();
    }

    if (cat.image) {
      // circular image clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(cat.x, cat.y, RADIUS, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(cat.image, cat.x - RADIUS, cat.y - RADIUS, RADIUS * 2, RADIUS * 2);
      ctx.restore();
    } else {
      // color circle with initials
      ctx.beginPath();
      ctx.arc(cat.x, cat.y, RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = cat.color;
      ctx.fill();

      ctx.globalAlpha = OPACITY * 1.8;
      ctx.font = `700 ${RADIUS * 0.65}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(cat.initials, cat.x, cat.y);
    }
  }

  ctx.globalAlpha = 1;
}

export function LobbyBouncingCats({
  animationMode,
  cats: catSummaries,
}: {
  animationMode: PlatformLobbyAnimationMode;
  cats: readonly PlatformLobbyCatSummary[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catsRef = useRef<BouncingCat[] | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (animationMode === 'off' || catSummaries.length === 0) {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;

    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;
    const speedMultiplier = animationMode === 'reduced'
      ? REDUCED_MOTION_SPEED_MULTIPLIER
      : 1;

    function resizeCanvas() {
      canvasElement.width = window.innerWidth;
      canvasElement.height = window.innerHeight;
      if (!catsRef.current) {
        catsRef.current = initCats([...catSummaries], canvasElement.width, canvasElement.height);
        return;
      }
      clampCats(catsRef.current, canvasElement.width, canvasElement.height);
    }

    function cancelFrame() {
      if (frameRef.current !== 0) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    }

    function drawLoop() {
      const w = canvasElement.width;
      const h = canvasElement.height;
      const cats = catsRef.current;
      if (!ctx || !cats) return;
      tick(cats, w, h, speedMultiplier);
      drawCats(ctx, cats, w, h);
      frameRef.current = requestAnimationFrame(drawLoop);
    }

    resizeCanvas();
    frameRef.current = requestAnimationFrame(drawLoop);

    // load avatar images async
    const bouncingCats = catsRef.current;
    if (bouncingCats) {
      for (let i = 0; i < catSummaries.length; i++) {
        const url = catSummaries[i]?.avatarUrl;
        if (url && bouncingCats[i]) {
          loadImage(url).then((img) => {
            bouncingCats[i].image = img;
          }).catch(() => { /* keep color fallback */ });
        }
      }
    }

    window.addEventListener('resize', resizeCanvas);

    return () => {
      cancelFrame();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [animationMode, catSummaries]);

  if (animationMode === 'off' || catSummaries.length === 0) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="lobbyBouncingCanvas"
      aria-hidden="true"
    />
  );
}
