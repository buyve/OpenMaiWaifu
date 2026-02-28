/**
 * Particle System — lightweight Three.js particle effects for character reactions.
 *
 * Uses Three.Points with BufferGeometry for efficient rendering.
 * Supports hearts (headpat), stars (happy), sweat drops (drag), zzz (sleep).
 * Additive blending for transparent background compatibility.
 */

import * as THREE from "three";

// ---------- Types ----------

export type ParticleType = "hearts" | "stars" | "sweat" | "zzz";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface ParticlePreset {
  /** Number of particles to emit per burst. */
  count: number;
  /** Lifetime in seconds. */
  lifetime: number;
  /** Initial size. */
  size: number;
  /** Color of the particle. */
  color: THREE.Color;
  /** Initial velocity range. */
  velocity: { minX: number; maxX: number; minY: number; maxY: number };
  /** Gravity (negative = upward). */
  gravity: number;
  /** Whether to use additive blending. */
  additive: boolean;
}

// ---------- Presets ----------

const PRESETS: Record<ParticleType, ParticlePreset> = {
  hearts: {
    count: 6,
    lifetime: 1.5,
    size: 0.06,
    color: new THREE.Color(0xff69b4), // hot pink
    velocity: { minX: -0.15, maxX: 0.15, minY: 0.1, maxY: 0.3 },
    gravity: -0.05, // float upward
    additive: true,
  },
  stars: {
    count: 8,
    lifetime: 1.2,
    size: 0.04,
    color: new THREE.Color(0xffd700), // gold
    velocity: { minX: -0.3, maxX: 0.3, minY: -0.1, maxY: 0.3 },
    gravity: -0.02,
    additive: true,
  },
  sweat: {
    count: 4,
    lifetime: 0.8,
    size: 0.03,
    color: new THREE.Color(0x87ceeb), // light blue
    velocity: { minX: -0.1, maxX: 0.1, minY: 0.05, maxY: 0.2 },
    gravity: 0.5, // fall down
    additive: false,
  },
  zzz: {
    count: 3,
    lifetime: 2.0,
    size: 0.05,
    color: new THREE.Color(0xccccff), // light purple
    velocity: { minX: 0.02, maxX: 0.08, minY: 0.05, maxY: 0.1 },
    gravity: -0.01, // very slow float up
    additive: true,
  },
};

// ---------- Constants ----------

/** Maximum particles that can exist at once across all types. */
const MAX_PARTICLES = 64;

// ---------- Class ----------

export class ParticleSystem {
  private _scene: THREE.Scene | null = null;

  // Per-type materials and point clouds for different colors
  private _pointSets: Map<ParticleType, {
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    particles: Particle[];
  }> = new Map();

  init(scene: THREE.Scene): void {
    this._scene = scene;

    // Create a point set for each particle type
    for (const [type, preset] of Object.entries(PRESETS) as [ParticleType, ParticlePreset][]) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_PARTICLES * 3);
      const sizes = new Float32Array(MAX_PARTICLES);
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.PointsMaterial({
        color: preset.color,
        size: preset.size,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: preset.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 999; // Render on top
      scene.add(points);

      this._pointSets.set(type, {
        points,
        geometry,
        material,
        particles: [],
      });
    }
  }

  /**
   * Emit a burst of particles at the given world position.
   */
  emit(type: ParticleType, worldX: number, worldY: number, worldZ = 0): void {
    const set = this._pointSets.get(type);
    if (!set) return;

    const preset = PRESETS[type];

    for (let i = 0; i < preset.count; i++) {
      if (set.particles.length >= MAX_PARTICLES) break;

      const vx = preset.velocity.minX + Math.random() * (preset.velocity.maxX - preset.velocity.minX);
      const vy = preset.velocity.minY + Math.random() * (preset.velocity.maxY - preset.velocity.minY);

      set.particles.push({
        x: worldX + (Math.random() - 0.5) * 0.1,
        y: worldY + (Math.random() - 0.5) * 0.1,
        z: worldZ + 0.1, // slightly in front
        vx,
        vy,
        life: preset.lifetime,
        maxLife: preset.lifetime,
        size: preset.size * (0.8 + Math.random() * 0.4),
      });
    }
  }

  /**
   * Update all particles. Must be called every frame.
   */
  update(delta: number): void {
    for (const [type, set] of this._pointSets) {
      const preset = PRESETS[type];
      const positions = set.geometry.attributes.position as THREE.BufferAttribute;
      const posArray = positions.array as Float32Array;

      // Update and remove dead particles
      let writeIdx = 0;
      for (let i = 0; i < set.particles.length; i++) {
        const p = set.particles[i];
        p.life -= delta;

        if (p.life <= 0) continue;

        // Physics
        p.vy -= preset.gravity * delta;
        p.x += p.vx * delta;
        p.y += p.vy * delta;

        posArray[writeIdx * 3] = p.x;
        posArray[writeIdx * 3 + 1] = p.y;
        posArray[writeIdx * 3 + 2] = p.z;

        set.particles[writeIdx] = p;
        writeIdx++;
      }

      // Clear unused positions
      for (let i = writeIdx; i < set.particles.length; i++) {
        posArray[i * 3] = 0;
        posArray[i * 3 + 1] = 0;
        posArray[i * 3 + 2] = -100; // hide off-screen
      }

      set.particles.length = writeIdx;
      set.geometry.setDrawRange(0, writeIdx);
      positions.needsUpdate = true;

      // Update material opacity based on oldest particle's life ratio
      if (writeIdx > 0) {
        const avgLife = set.particles.reduce((sum, p) => sum + p.life / p.maxLife, 0) / writeIdx;
        set.material.opacity = Math.max(0.1, avgLife * 0.8);
      } else {
        set.material.opacity = 0;
      }
    }
  }

  dispose(): void {
    for (const [, set] of this._pointSets) {
      if (this._scene) {
        this._scene.remove(set.points);
      }
      set.geometry.dispose();
      set.material.dispose();
    }
    this._pointSets.clear();
    this._scene = null;
  }
}
