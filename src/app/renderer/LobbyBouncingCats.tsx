import { useEffect, useRef } from 'react';

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

export function LobbyBouncingCats() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catsRef = useRef<BouncingCat[] | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      canvas!.width = parent.clientWidth;
      canvas!.height = parent.clientHeight;
      if (!catsRef.current) {
        catsRef.current = initCats(canvas!.width, canvas!.height);
      }
    }

    resize();
    window.addEventListener('resize', resize);

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const cats = catsRef.current;
      if (!ctx || !cats) return;

      ctx.clearRect(0, 0, w, h);
      tick(cats, w, h);

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

      frameRef.current = requestAnimationFrame(draw);
    }

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="lobbyBouncingCanvas"
      aria-hidden="true"
    />
  );
}
