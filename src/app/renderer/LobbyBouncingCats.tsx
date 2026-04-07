import { useEffect, useRef } from 'react';

import type { PlatformLobbyAnimationMode } from '../../shared/platform-contract.js';

interface BouncingCat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  initials: string;
}

const MOCK_CATS: Pick<BouncingCat, 'color' | 'initials'>[] = [
  { color: '#E0B323', initials: 'MO' },
  { color: '#6E8450', initials: 'LU' },
  { color: '#4F6C92', initials: 'KI' },
  { color: '#C4653A', initials: 'SO' },
  { color: '#90A4AE', initials: 'TA' },
  { color: '#8B6DAF', initials: 'MI' },
];

const RADIUS = 20;
const BASE_SPEED = 0.6;
const OPACITY = 0.18;
const REDUCED_MOTION_SPEED_MULTIPLIER = 0.18;

function initCats(width: number, height: number): BouncingCat[] {
  return MOCK_CATS.map((cat) => {
    const angle = Math.random() * Math.PI * 2;
    const speed = BASE_SPEED + Math.random() * 0.3;
    return {
      ...cat,
      radius: RADIUS,
      x: RADIUS + Math.random() * (width - RADIUS * 2),
      y: RADIUS + Math.random() * (height - RADIUS * 2),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    };
  });
}

function tick(cats: BouncingCat[], width: number, height: number): void {
  for (const cat of cats) {
    cat.x += cat.vx;
    cat.y += cat.vy;

    if (cat.x - cat.radius <= 0) {
      cat.x = cat.radius;
      cat.vx = Math.abs(cat.vx);
    } else if (cat.x + cat.radius >= width) {
      cat.x = width - cat.radius;
      cat.vx = -Math.abs(cat.vx);
    }

    if (cat.y - cat.radius <= 0) {
      cat.y = cat.radius;
      cat.vy = Math.abs(cat.vy);
    } else if (cat.y + cat.radius >= height) {
      cat.y = height - cat.radius;
      cat.vy = -Math.abs(cat.vy);
    }
  }
}

function tickWithSpeedMultiplier(
  cats: BouncingCat[],
  width: number,
  height: number,
  multiplier: number,
): void {
  if (multiplier === 1) {
    tick(cats, width, height);
    return;
  }

  for (const cat of cats) {
    cat.x += cat.vx * multiplier;
    cat.y += cat.vy * multiplier;

    if (cat.x - cat.radius <= 0) {
      cat.x = cat.radius;
      cat.vx = Math.abs(cat.vx);
    } else if (cat.x + cat.radius >= width) {
      cat.x = width - cat.radius;
      cat.vx = -Math.abs(cat.vx);
    }

    if (cat.y - cat.radius <= 0) {
      cat.y = cat.radius;
      cat.vy = Math.abs(cat.vy);
    } else if (cat.y + cat.radius >= height) {
      cat.y = height - cat.radius;
      cat.vy = -Math.abs(cat.vy);
    }
  }
}

function clampCats(cats: BouncingCat[], width: number, height: number): void {
  for (const cat of cats) {
    cat.x = Math.min(Math.max(cat.radius, cat.x), width - cat.radius);
    cat.y = Math.min(Math.max(cat.radius, cat.y), height - cat.radius);
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
    ctx.beginPath();
    ctx.arc(cat.x, cat.y, cat.radius, 0, Math.PI * 2);
    ctx.fillStyle = cat.color;
    ctx.fill();

    ctx.globalAlpha = OPACITY * 1.8;
    ctx.font = `600 ${cat.radius * 0.85}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(cat.initials, cat.x, cat.y);
  }

  ctx.globalAlpha = 1;
}

export function LobbyBouncingCats({
  animationMode,
}: {
  animationMode: PlatformLobbyAnimationMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catsRef = useRef<BouncingCat[] | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (animationMode === 'off') {
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
        catsRef.current = initCats(canvasElement.width, canvasElement.height);
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

    function renderFrame(speedMultiplier: number) {
      const w = canvasElement.width;
      const h = canvasElement.height;
      const cats = catsRef.current;
      if (!ctx || !cats) return;

      tickWithSpeedMultiplier(cats, w, h, speedMultiplier);
      drawCats(ctx, cats, w, h);
    }

    function drawLoop() {
      renderFrame(speedMultiplier);
      frameRef.current = requestAnimationFrame(drawLoop);
    }

    function startLoop() {
      cancelFrame();
      resizeCanvas();
      frameRef.current = requestAnimationFrame(drawLoop);
    }

    function handleResize() {
      resizeCanvas();
      renderFrame(speedMultiplier);
    }

    startLoop();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelFrame();
      window.removeEventListener('resize', handleResize);
    };
  }, [animationMode]);

  if (animationMode === 'off') {
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
