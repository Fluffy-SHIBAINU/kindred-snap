"use client";

import { useEffect, useRef } from "react";

/**
 * Window Dust — the landing hero's particle field (docs/design/FIELD.md).
 * Seeded noise flow field, few faint motes, three fixed light panes. Pauses off screen and
 * under prefers-reduced-motion (one still frame). Plain canvas 2D: no library, no clock.
 */
type Props = { seed?: number; count?: number; className?: string };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two-octave value noise over a seeded lattice: enough for air, far cheaper than Perlin.
function makeNoise(rand: () => number) {
  const size = 64;
  const grid = Float32Array.from({ length: size * size }, () => rand());
  const at = (x: number, y: number) => grid[((y & (size - 1)) * size + (x & (size - 1))) >>> 0];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  return (x: number, y: number, t: number) => value(x * 0.9 + t, y * 0.9) * 0.7 + value(x * 3.1 - t * 0.6, y * 3.1 + 7) * 0.3;
}

const PANES = [
  { x: 0.52, w: 0.14, skew: -0.22 },
  { x: 0.7, w: 0.1, skew: -0.22 },
  { x: 0.84, w: 0.12, skew: -0.22 },
];

export default function WindowDust({ seed = 20261109, count = 90, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = mulberry32(seed);
    const noise = makeNoise(rand);
    const motes = Array.from({ length: count }, () => ({ x: rand(), y: rand(), r: 1 + rand() * 1.5, a: 0.08 + rand() * 0.14 }));
    let t = 0;
    let raf = 0;
    let visible = true;

    const inPane = (x: number, y: number) =>
      PANES.some((p) => {
        const cx = p.x + p.skew * (y - 0.5);
        return x > cx - p.w / 2 && x < cx + p.w / 2;
      });

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // light panes: paper-white, barely there
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (const p of PANES) {
        ctx.beginPath();
        ctx.moveTo((p.x - p.w / 2 + p.skew * -0.5) * w, 0);
        ctx.lineTo((p.x + p.w / 2 + p.skew * -0.5) * w, 0);
        ctx.lineTo((p.x + p.w / 2 + p.skew * 0.5) * w, h);
        ctx.lineTo((p.x - p.w / 2 + p.skew * 0.5) * w, h);
        ctx.closePath();
        ctx.fill();
      }
      for (const m of motes) {
        const angle = noise(m.x * 4, m.y * 4, t) * Math.PI * 2;
        m.x = (m.x + Math.cos(angle) * 0.00045 + 1) % 1;
        m.y = (m.y + Math.sin(angle) * 0.00045 + 0.00012 + 1) % 1;
        const lit = inPane(m.x, m.y);
        ctx.fillStyle = lit ? `rgba(0,121,72,${Math.min(0.3, m.a + 0.1)})` : `rgba(0,121,72,${m.a})`;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      t += 0.0025;
    };

    const loop = () => {
      if (visible) draw();
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(canvas);
    draw();
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [seed, count]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
