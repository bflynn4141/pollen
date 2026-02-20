"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { ParticleSystem } from "./particle-system";
import { useIsMobile, useReducedMotion } from "@/lib/hooks";

const BG_COLOR = "#FAF8F5";

export default function PollenCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const reducedMotion = useReducedMotion();

  useEffect(() => setMounted(true), []);

  const getConfig = useCallback(() => {
    if (reducedMotion) {
      return { maxParticles: 50, spawnRate: 2, driftSpeed: 8 };
    }
    if (isMobile) {
      return { maxParticles: 150, spawnRate: 5, driftSpeed: 20 };
    }
    return {};
  }, [isMobile, reducedMotion]);

  useEffect(() => {
    if (!mounted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const system = new ParticleSystem(getConfig());
    system.setInputMode("ambient");

    let currentDpr = 1;

    const handleResize = () => {
      currentDpr = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * currentDpr;
      canvas.height = h * currentDpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
      system.resize(w, h, currentDpr);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // Mouse tracking (desktop only)
    let hasMouseMoved = false;
    const handleMouseMove = (e: MouseEvent) => {
      if (isMobile) return;
      if (!hasMouseMoved) {
        hasMouseMoved = true;
        system.setInputMode("mouse");
      }
      system.setMousePosition(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
      system.setInputMode("ambient");
      hasMouseMoved = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    // Animation loop
    const timeScale = reducedMotion ? 0.25 : 1;

    const tick = (now: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = now;
      const rawDt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Clamp dt to avoid huge jumps on tab switch
      const dt = Math.min(rawDt, 0.1) * timeScale;

      // Clear with background color (use logical dimensions via DPR transform)
      const w = canvas.width / currentDpr;
      const h = canvas.height / currentDpr;
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);

      system.update(dt);
      system.render(ctx);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [mounted, isMobile, reducedMotion, getConfig]);

  if (!mounted) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}
