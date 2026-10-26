import { useEffect, useRef } from "react";

const BASE = "#101116";

const ORBS = [
  {
    color: "38, 26, 16",
    cx: 0.22,
    cy: 0.28,
    r: 0.75,
    sx: 0.05,
    sy: 0.04,
    px: 0.0,
    py: 1.7,
  },
  {
    color: "249, 115, 22",
    cx: 0.72,
    cy: 0.7,
    r: 0.55,
    sx: 0.038,
    sy: 0.05,
    px: 2.1,
    py: 0.6,
  },
  {
    color: "64, 78, 112",
    cx: 0.5,
    cy: 0.15,
    r: 0.65,
    sx: 0.03,
    sy: 0.036,
    px: 4.2,
    py: 3.1,
  },
];

export function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawOrbs = (t: number) => {
      ctx.globalCompositeOperation = "screen";
      for (const orb of ORBS) {
        const x = (orb.cx + Math.sin(t * orb.sx + orb.px) * 0.1) * width;
        const y = (orb.cy + Math.cos(t * orb.sy + orb.py) * 0.1) * height;
        const r = orb.r * Math.max(width, height);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(${orb.color}, 0.17)`);
        gradient.addColorStop(0.5, `rgba(${orb.color}, 0.06)`);
        gradient.addColorStop(1, `rgba(${orb.color}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawVignette = () => {
      const gradient = ctx.createRadialGradient(
        width / 2,
        height * 0.42,
        Math.min(width, height) * 0.3,
        width / 2,
        height * 0.5,
        Math.max(width, height) * 0.85,
      );
      gradient.addColorStop(0, "rgba(11, 12, 16, 0)");
      gradient.addColorStop(1, "rgba(11, 12, 16, 0.55)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    };

    const draw = (t: number) => {
      ctx.fillStyle = BASE;
      ctx.fillRect(0, 0, width, height);
      drawOrbs(t);
      drawVignette();
    };

    let raf = 0;
    const loop = (now: number) => {
      draw(now / 1000);
      raf = requestAnimationFrame(loop);
    };

    const onResize = () => {
      resize();
      if (reduceMotion) draw(12);
    };

    resize();
    if (reduceMotion) {
      draw(12);
    } else {
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full"
    />
  );
}
