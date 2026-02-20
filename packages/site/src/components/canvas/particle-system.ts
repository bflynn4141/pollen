import { Particle, ParticleConfig, HSLColor, InputMode } from "./types";
import { noise2D } from "./noise";

const PALETTE: HSLColor[] = [
  { h: 330, s: 65, l: 80 }, // Soft pink
  { h: 270, s: 55, l: 78 }, // Lavender
  { h: 210, s: 60, l: 82 }, // Pale blue
  { h: 150, s: 40, l: 80 }, // Sage green
  { h: 300, s: 45, l: 82 }, // Pale orchid
];

const BLOOM_COLOR: HSLColor = { h: 45, s: 70, l: 85 }; // Warm gold

const DEFAULT_CONFIG: ParticleConfig = {
  maxParticles: 400,
  spawnRate: 8,
  minRadius: 15,
  maxRadius: 60,
  minLifespan: 6,
  maxLifespan: 14,
  noiseScale: 0.002,
  noiseSpeed: 0.0003,
  driftSpeed: 30,
  mouseInfluenceRadius: 200,
  mouseSpawnRate: 12,
};

export class ParticleSystem {
  private particles: Particle[] = [];
  private config: ParticleConfig;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private time = 0;
  private spawnAccumulator = 0;
  private mouseX = 0;
  private mouseY = 0;
  private inputMode: InputMode = "ambient";

  constructor(config?: Partial<ParticleConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  setMousePosition(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  setInputMode(mode: InputMode): void {
    this.inputMode = mode;
  }

  update(dt: number): void {
    this.time += dt;

    // Accumulate spawn timer
    const rate =
      this.inputMode === "mouse"
        ? this.config.mouseSpawnRate
        : this.config.spawnRate;
    this.spawnAccumulator += dt * rate;

    while (
      this.spawnAccumulator >= 1 &&
      this.particles.length < this.config.maxParticles
    ) {
      this.spawnParticle();
      this.spawnAccumulator -= 1;
    }
    // Clamp accumulator so we don't burst after a long pause
    if (this.spawnAccumulator > 3) this.spawnAccumulator = 3;

    const { noiseScale, noiseSpeed, driftSpeed } = this.config;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;

      // Remove dead particles
      if (p.age >= p.lifespan) {
        this.particles.splice(i, 1);
        continue;
      }

      const t = p.age / p.lifespan;
      this.updatePhase(p, t);

      // Noise-based velocity
      const noiseVal = noise2D(
        p.x * noiseScale,
        p.y * noiseScale + this.time * noiseSpeed,
      );
      const angle = noiseVal * Math.PI * 2;
      p.vx = Math.cos(angle) * driftSpeed;
      p.vy = Math.sin(angle) * driftSpeed;

      // Apply velocity
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Soft wrap — particles that drift off-screen respawn on the opposite edge
      if (p.x < -p.maxRadius) p.x = this.width + p.maxRadius;
      if (p.x > this.width + p.maxRadius) p.x = -p.maxRadius;
      if (p.y < -p.maxRadius) p.y = this.height + p.maxRadius;
      if (p.y > this.height + p.maxRadius) p.y = -p.maxRadius;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.globalCompositeOperation = "source-over";

    for (const p of this.particles) {
      if (p.opacity <= 0 || p.radius <= 0) continue;

      const { h, s, l } = p.color;
      const gradient = ctx.createRadialGradient(
        p.x,
        p.y,
        0,
        p.x,
        p.y,
        p.radius,
      );
      gradient.addColorStop(0, `hsla(${h}, ${s}%, ${l}%, 1)`);
      gradient.addColorStop(0.6, `hsla(${h}, ${s}%, ${l}%, 0.4)`);
      gradient.addColorStop(1, `hsla(${h}, ${s}%, ${l}%, 0)`);

      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  get particleCount(): number {
    return this.particles.length;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private spawnParticle(): void {
    let x: number;
    let y: number;

    if (this.inputMode === "mouse") {
      // Spawn near mouse with gaussian-ish spread
      const spread = this.config.mouseInfluenceRadius;
      x = this.mouseX + (Math.random() - 0.5) * spread;
      y = this.mouseY + (Math.random() - 0.5) * spread;
    } else {
      x = Math.random() * this.width;
      y = Math.random() * this.height;
    }

    const color = this.randomColor();
    const maxRadius =
      this.config.minRadius +
      Math.random() * (this.config.maxRadius - this.config.minRadius);
    const lifespan =
      this.config.minLifespan +
      Math.random() * (this.config.maxLifespan - this.config.minLifespan);

    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 0,
      maxRadius,
      color: { ...color },
      originalColor: { ...color },
      opacity: 0,
      age: 0,
      lifespan,
      phase: "spawn",
    });
  }

  private updatePhase(p: Particle, t: number): void {
    if (t < 0.15) {
      // Spawn phase: grow radius, fade in
      p.phase = "spawn";
      const st = this.easeInOut(t / 0.15);
      p.radius = p.maxRadius * 0.6 * st;
      p.opacity = 0.2 * st;
      p.color = { ...p.originalColor };
    } else if (t < 0.6) {
      // Drift phase: stable with gentle breathing
      p.phase = "drift";
      const breathe = Math.sin(((t - 0.15) / 0.45) * Math.PI) * 0.05;
      p.radius = p.maxRadius * (0.6 + breathe);
      p.opacity = 0.15 + breathe * 2;
      p.color = { ...p.originalColor };
    } else if (t < 0.8) {
      // Bloom phase: grow, shift to gold, peak opacity
      p.phase = "bloom";
      const bt = this.easeInOut((t - 0.6) / 0.2);
      p.radius = p.maxRadius * (0.6 + 0.4 * bt);
      p.color = this.lerpColor(p.originalColor, BLOOM_COLOR, bt * 0.5);
      p.opacity = 0.2 + 0.1 * bt;
    } else {
      // Fade phase: dissolve
      p.phase = "fade";
      const ft = this.easeInOut((t - 0.8) / 0.2);
      p.radius = p.maxRadius;
      p.opacity = 0.3 * (1 - ft);
      // Keep bloom color as we fade
      p.color = this.lerpColor(p.originalColor, BLOOM_COLOR, 0.5 * (1 - ft));
    }
  }

  private randomColor(): HSLColor {
    return { ...PALETTE[Math.floor(Math.random() * PALETTE.length)] };
  }

  private lerpColor(a: HSLColor, b: HSLColor, t: number): HSLColor {
    return {
      h: a.h + (b.h - a.h) * t,
      s: a.s + (b.s - a.s) * t,
      l: a.l + (b.l - a.l) * t,
    };
  }

  private easeInOut(t: number): number {
    // Smoothstep
    const clamped = Math.max(0, Math.min(1, t));
    return clamped * clamped * (3 - 2 * clamped);
  }
}

export default ParticleSystem;
