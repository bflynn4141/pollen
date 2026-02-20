export interface HSLColor {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export type InputMode = "mouse" | "ambient";

export type ParticlePhase = "spawn" | "drift" | "bloom" | "fade";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  color: HSLColor;
  originalColor: HSLColor;
  opacity: number;
  age: number;
  lifespan: number;
  phase: ParticlePhase;
}

export interface ParticleConfig {
  maxParticles: number;
  spawnRate: number; // particles per second
  minRadius: number;
  maxRadius: number;
  minLifespan: number; // seconds
  maxLifespan: number;
  noiseScale: number;
  noiseSpeed: number;
  driftSpeed: number;
  mouseInfluenceRadius: number;
  mouseSpawnRate: number; // particles per second near mouse
}
