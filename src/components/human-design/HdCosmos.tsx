"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  driftX: number;
  driftY: number;
  hue: number;
}

/** Animated starfield + nebula backdrop for the bodygraph stage. */
export default function HdCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stars: Star[] = [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const count = Math.floor((rect.width * rect.height) / 4500);
      stars = Array.from({ length: Math.min(160, Math.max(60, count)) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: (Math.random() * 1.1 + 0.4) * dpr,
        baseAlpha: Math.random() * 0.5 + 0.25,
        twinkleSpeed: Math.random() * 1.6 + 0.4,
        driftX: (Math.random() - 0.5) * 0.06 * dpr,
        driftY: (Math.random() - 0.5) * 0.04 * dpr,
        hue: Math.random() < 0.75 ? 45 : 275, // gold or violet
      }));
    };

    const paintNebula = () => {
      const { width: w, height: h } = canvas;
      const g1 = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, w * 0.55);
      g1.addColorStop(0, "rgba(155, 127, 212, 0.10)");
      g1.addColorStop(1, "rgba(155, 127, 212, 0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w * 0.85, h * 0.8, 0, w * 0.85, h * 0.8, w * 0.5);
      g2.addColorStop(0, "rgba(232, 199, 126, 0.07)");
      g2.addColorStop(1, "rgba(232, 199, 126, 0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintNebula();
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 70%, 82%, ${s.baseAlpha})`;
        ctx.fill();
      }
    };

    let t = 0;
    const frame = () => {
      t += 0.016;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintNebula();
      for (const s of stars) {
        s.x += s.driftX;
        s.y += s.driftY;
        if (s.x < 0) s.x = canvas.width;
        if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height;
        if (s.y > canvas.height) s.y = 0;
        const twinkle = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.x);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 70%, 82%, ${(s.baseAlpha * twinkle).toFixed(3)})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };

    resize();
    if (reduceMotion) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
    }

    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion) drawStatic();
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="hd-cosmos" aria-hidden="true" />;
}
