import { useEffect, useRef } from "react";

const BASE = "#101116";

const ORBS = [
  { color: "38, 26, 16", cx: 0.22, cy: 0.28, r: 0.75, sx: 0.05, sy: 0.04, px: 0.0, py: 1.7 },
  { color: "249, 115, 22", cx: 0.72, cy: 0.7, r: 0.55, sx: 0.038, sy: 0.05, px: 2.1, py: 0.6 },
  { color: "64, 78, 112", cx: 0.5, cy: 0.15, r: 0.65, sx: 0.03, sy: 0.036, px: 4.2, py: 3.1 },
];

const WAVE_LINES = 26;

export function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    const drawWaves = (t: number) => {
      const bandTop = height * 0.3;
      const bandHeight = height * 0.52;
      const step = Math.max(6, width / 220);

      ctx.globalCompositeOperation = "screen";

      for (let i = 0; i < WAVE_LINES; i++) {
        const p = i / (WAVE_LINES - 1);
        const yBase = bandTop + p * bandHeight;
        // Strongest through the middle of the band, silent at its edges
        const presence = Math.sin(Math.PI * p) ** 2;
        // A few warm lines threaded through an otherwise silver field
        const warm = i % 5 === 2;
        const alpha = presence * (warm ? 0.34 : 0.17);
        if (alpha < 0.01) continue;
        ctx.lineWidth = warm ? 1.4 : 1;

        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        const color = warm ? "249, 146, 60" : "168, 178, 198";
        gradient.addColorStop(0, `rgba(${color}, 0)`);
        gradient.addColorStop(0.5, `rgba(${color}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${color}, 0)`);
        ctx.strokeStyle = gradient;

        ctx.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const u = x / width;
          // Damped envelope: waves swell mid-screen and settle at the edges
          const envelope = Math.sin(Math.PI * Math.min(Math.max(u, 0), 1)) ** 1.5;
          const y =
            yBase +
            envelope *
              (Math.sin(u * 6.3 + t * 0.42 + i * 0.34) * 26 +
                Math.sin(u * 11.7 - t * 0.27 + i * 0.19) * 13 +
                Math.sin(u * 2.4 + t * 0.11 + i * 0.52) * 34);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
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
      drawWaves(t);
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
