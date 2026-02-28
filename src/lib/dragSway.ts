/**
 * Drag Sway Physics — Spring-based body sway during drag
 * Ported from Mate-Engine's AvatarSwayController.cs
 *
 * When the character is dragged, the body leans in the opposite direction
 * of movement with spring physics (overshoot + bounce back).
 * Also applies to arms and legs with a slight lag for natural motion.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

// ---------- Config ----------

export interface DragSwayConfig {
  enabled: boolean;

  // How much mouse velocity translates to lean
  horizontalVelocityToLean: number;  // default 0.25
  verticalVelocityToPitch: number;   // default 0.15

  // Max lean angles (degrees)
  maxLeanZ: number;   // roll, default 25
  maxLeanX: number;   // pitch, default 12

  // Spring physics
  springFrequency: number;   // default 2.6
  dampingRatio: number;      // default 0.35
  blendSpeed: number;        // weight blend speed, default 8

  // Arms/Legs additive
  armsAdditive: number;      // 0-1, default 0.3
  legsAdditive: number;      // 0-1, default 0.15
  armsMaxZ: number;          // default 18
  armsMaxX: number;          // default 8
  legsMaxZ: number;          // default 12
  legsMaxX: number;          // default 6
  limbLag: number;           // how much limbs lag behind, default 6
}

const DEFAULT_CONFIG: DragSwayConfig = {
  enabled: true,
  horizontalVelocityToLean: 0.25,
  verticalVelocityToPitch: 0.15,
  maxLeanZ: 25,
  maxLeanX: 12,
  springFrequency: 2.6,
  dampingRatio: 0.35,
  blendSpeed: 8,
  armsAdditive: 0.3,
  legsAdditive: 0.15,
  armsMaxZ: 18,
  armsMaxX: 8,
  legsMaxZ: 12,
  legsMaxX: 6,
  limbLag: 6,
};

// ---------- Class ----------

export class DragSway {
  config: DragSwayConfig;

  // Bones
  private _hips: THREE.Object3D | null = null;
  private _leftUpperArm: THREE.Object3D | null = null;
  private _rightUpperArm: THREE.Object3D | null = null;
  private _leftUpperLeg: THREE.Object3D | null = null;
  private _rightUpperLeg: THREE.Object3D | null = null;

  // Spring state
  private _leanZ = 0;  // roll
  private _leanZVel = 0;
  private _leanX = 0;  // pitch
  private _leanXVel = 0;
  private _effectWeight = 0;

  // Limb lag
  private _limbZ = 0;
  private _limbX = 0;

  // Mouse velocity tracking
  private _prevMouseX = 0;
  private _prevMouseY = 0;
  private _filteredDeltaX = 0;
  private _filteredDeltaY = 0;
  private _hasInitMouse = false;

  // Additive tracking (for undo)
  private _lastHipsAdd = new THREE.Quaternion();
  private _lastArmLAdd = new THREE.Quaternion();
  private _lastArmRAdd = new THREE.Quaternion();
  private _lastLegLAdd = new THREE.Quaternion();
  private _lastLegRAdd = new THREE.Quaternion();

  private _initialized = false;

  constructor(config?: Partial<DragSwayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(vrm: VRM): void {
    const h = vrm.humanoid;
    if (!h) return;

    this._hips = h.getNormalizedBoneNode("hips");
    this._leftUpperArm = h.getNormalizedBoneNode("leftUpperArm");
    this._rightUpperArm = h.getNormalizedBoneNode("rightUpperArm");
    this._leftUpperLeg = h.getNormalizedBoneNode("leftUpperLeg");
    this._rightUpperLeg = h.getNormalizedBoneNode("rightUpperLeg");

    this._initialized = true;
  }

  /**
   * Call every frame AFTER animation update but BEFORE vrm.update().
   */
  update(
    mouseX: number,
    mouseY: number,
    isDragging: boolean,
    delta: number,
  ): void {
    if (!this._initialized || !this.config.enabled || !this._hips) return;

    // Remove previous frame's additive rotations
    this._clearAdditives();

    // Calculate mouse velocity
    if (!this._hasInitMouse) {
      this._prevMouseX = mouseX;
      this._prevMouseY = mouseY;
      this._hasInitMouse = true;
    }

    const dx = mouseX - this._prevMouseX;
    const dy = mouseY - this._prevMouseY;
    this._prevMouseX = mouseX;
    this._prevMouseY = mouseY;

    // Smooth the delta
    const filterT = 1 - Math.exp(-12 * delta);
    if (isDragging) {
      this._filteredDeltaX = lerp(this._filteredDeltaX, dx, filterT);
      this._filteredDeltaY = lerp(this._filteredDeltaY, dy, filterT);
    } else {
      this._filteredDeltaX = lerp(this._filteredDeltaX, 0, filterT);
      this._filteredDeltaY = lerp(this._filteredDeltaY, 0, filterT);
    }

    // Target lean from velocity
    const targetLeanZ = isDragging
      ? clamp(
          -this._filteredDeltaX * this.config.horizontalVelocityToLean,
          -this.config.maxLeanZ,
          this.config.maxLeanZ,
        )
      : 0;
    const targetLeanX = isDragging
      ? clamp(
          -this._filteredDeltaY * this.config.verticalVelocityToPitch,
          -this.config.maxLeanX,
          this.config.maxLeanX,
        )
      : 0;

    // Spring physics
    const freq = Math.max(0.01, this.config.springFrequency) * 2 * Math.PI;
    const damp = this.config.dampingRatio;
    [this._leanZ, this._leanZVel] = spring(this._leanZ, this._leanZVel, targetLeanZ, freq, damp, delta);
    [this._leanX, this._leanXVel] = spring(this._leanX, this._leanXVel, targetLeanX, freq, damp, delta);

    // Limbs lag behind
    this._limbZ = lerp(this._limbZ, -this._leanZ, 1 - Math.exp(-this.config.limbLag * delta));
    this._limbX = lerp(this._limbX, -this._leanX, 1 - Math.exp(-this.config.limbLag * delta));

    // Effect weight blend
    const targetWeight = isDragging ? 1 : 0;
    const blendSpeed = isDragging ? this.config.blendSpeed : this.config.blendSpeed * 2;
    this._effectWeight = moveTowards(this._effectWeight, targetWeight, blendSpeed * delta);

    if (this._effectWeight < 0.001) return;

    // Apply rotations
    const xH = this._leanX * this._effectWeight * (Math.PI / 180);
    const zH = this._leanZ * this._effectWeight * (Math.PI / 180);

    // Hips
    this._lastHipsAdd.setFromEuler(new THREE.Euler(xH, 0, zH));
    this._hips.quaternion.multiply(this._lastHipsAdd);

    // Arms
    if (this.config.armsAdditive > 0) {
      const xA = clamp(this._limbX * this.config.armsAdditive, -this.config.armsMaxX, this.config.armsMaxX) * this._effectWeight * (Math.PI / 180);
      const zA = clamp(this._limbZ * this.config.armsAdditive, -this.config.armsMaxZ, this.config.armsMaxZ) * this._effectWeight * (Math.PI / 180);
      const armAdd = new THREE.Quaternion().setFromEuler(new THREE.Euler(xA, 0, zA));

      if (this._leftUpperArm) {
        this._lastArmLAdd.copy(armAdd);
        this._leftUpperArm.quaternion.multiply(armAdd);
      }
      if (this._rightUpperArm) {
        this._lastArmRAdd.copy(armAdd);
        this._rightUpperArm.quaternion.multiply(armAdd);
      }
    }

    // Legs
    if (this.config.legsAdditive > 0) {
      const xL = clamp(this._limbX * this.config.legsAdditive, -this.config.legsMaxX, this.config.legsMaxX) * this._effectWeight * (Math.PI / 180);
      const zL = clamp(this._limbZ * this.config.legsAdditive, -this.config.legsMaxZ, this.config.legsMaxZ) * this._effectWeight * (Math.PI / 180);
      const legAdd = new THREE.Quaternion().setFromEuler(new THREE.Euler(xL, 0, zL));

      if (this._leftUpperLeg) {
        this._lastLegLAdd.copy(legAdd);
        this._leftUpperLeg.quaternion.multiply(legAdd);
      }
      if (this._rightUpperLeg) {
        this._lastLegRAdd.copy(legAdd);
        this._rightUpperLeg.quaternion.multiply(legAdd);
      }
    }
  }

  dispose(): void {
    this._clearAdditives();
    this._initialized = false;
  }

  private _clearAdditives(): void {
    if (this._hips && !isIdentity(this._lastHipsAdd)) {
      this._hips.quaternion.multiply(this._lastHipsAdd.clone().invert());
    }
    if (this._leftUpperArm && !isIdentity(this._lastArmLAdd)) {
      this._leftUpperArm.quaternion.multiply(this._lastArmLAdd.clone().invert());
    }
    if (this._rightUpperArm && !isIdentity(this._lastArmRAdd)) {
      this._rightUpperArm.quaternion.multiply(this._lastArmRAdd.clone().invert());
    }
    if (this._leftUpperLeg && !isIdentity(this._lastLegLAdd)) {
      this._leftUpperLeg.quaternion.multiply(this._lastLegLAdd.clone().invert());
    }
    if (this._rightUpperLeg && !isIdentity(this._lastLegRAdd)) {
      this._rightUpperLeg.quaternion.multiply(this._lastLegRAdd.clone().invert());
    }

    this._lastHipsAdd.identity();
    this._lastArmLAdd.identity();
    this._lastArmRAdd.identity();
    this._lastLegLAdd.identity();
    this._lastLegRAdd.identity();
  }
}

// ---------- Utility ----------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function isIdentity(q: THREE.Quaternion): boolean {
  return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1;
}

/**
 * Damped spring physics (same formula as Mate-Engine).
 * Pure function — returns [newPosition, newVelocity].
 */
function spring(
  x: number,
  v: number,
  target: number,
  w: number,
  z: number,
  dt: number,
): [number, number] {
  const a = w * w * (target - x) - 2 * z * w * v;
  const newV = v + a * dt;
  const newX = x + newV * dt;
  return [newX, newV];
}
