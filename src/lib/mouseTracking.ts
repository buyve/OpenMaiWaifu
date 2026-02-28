/**
 * Mouse Tracking System — Head + Spine follow mouse cursor
 * 
 * Simple approach: use normalized mouse screen position to drive
 * additive yaw/pitch on head and spine bones.
 * Eye tracking is handled separately by VRM lookAt.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

// ---------- Config ----------

export interface MouseTrackingConfig {
  enabled: boolean;
  headYawLimit: number;     // degrees, max left/right
  headPitchLimit: number;   // degrees, max up/down
  headSmoothness: number;   // higher = faster response
  headBlend: number;        // 0-1
  spineEnabled: boolean;
  spineYawLimit: number;    // degrees
  spineSmoothness: number;
  spineBlend: number;
  chestFactor: number;      // 0-1, how much chest follows
  /** Eye-lead factor: eyes arrive 30% ahead of head rotation (0-1). */
  eyeLeadFactor: number;
}

const DEFAULT_CONFIG: MouseTrackingConfig = {
  enabled: true,
  headYawLimit: 45,
  headPitchLimit: 30,
  headSmoothness: 8,
  headBlend: 1.0,
  spineEnabled: true,
  spineYawLimit: 15,
  spineSmoothness: 5,
  spineBlend: 0.8,
  chestFactor: 0.7,
  eyeLeadFactor: 0.3,
};

// ---------- Class ----------

export class MouseTracker {
  config: MouseTrackingConfig;

  private _headBone: THREE.Object3D | null = null;
  private _spineBone: THREE.Object3D | null = null;
  private _chestBone: THREE.Object3D | null = null;

  // Smoothed target angles (degrees)
  private _headYaw = 0;
  private _headPitch = 0;
  private _spineYaw = 0;

  // Current applied additive quaternions (for undo)
  private _headAdd = new THREE.Quaternion();
  private _spineAdd = new THREE.Quaternion();
  private _chestAdd = new THREE.Quaternion();

  // Eye-lead: degrees by which eyes should lead head rotation
  private _eyeLeadYaw = 0;
  private _eyeLeadPitch = 0;

  private _initialized = false;

  constructor(config?: Partial<MouseTrackingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(vrm: VRM): void {
    const h = vrm.humanoid;
    if (!h) return;

    this._headBone = h.getNormalizedBoneNode("head");
    this._spineBone = h.getNormalizedBoneNode("spine");
    this._chestBone = h.getNormalizedBoneNode("chest");

    this._headYaw = 0;
    this._headPitch = 0;
    this._spineYaw = 0;
    this._headAdd.identity();
    this._spineAdd.identity();
    this._chestAdd.identity();

    this._initialized = true;
  }

  /**
   * @param mouseNdcX - Mouse X in NDC [-1, 1] (left to right)
   * @param mouseNdcY - Mouse Y in NDC [-1, 1] (bottom to top)
   * @param delta - Frame delta seconds
   * @param isDragging - Disable during drag
   */
  update(
    mouseNdcX: number,
    mouseNdcY: number,
    delta: number,
    isDragging = false,
  ): void {
    if (!this._initialized || !this.config.enabled) return;

    // First, undo previous frame's additive rotations
    this._undoAdditives();

    if (isDragging) {
      // Smoothly return to neutral
      this._headYaw = lerp(this._headYaw, 0, Math.min(1, delta * this.config.headSmoothness));
      this._headPitch = lerp(this._headPitch, 0, Math.min(1, delta * this.config.headSmoothness));
      this._spineYaw = lerp(this._spineYaw, 0, Math.min(1, delta * this.config.spineSmoothness));
    } else {
      // Target angles from mouse position
      // mouseNdcX: -1 (left) to 1 (right) → yaw: positive = turn right
      // mouseNdcY: -1 (bottom) to 1 (top) → pitch: positive = look up
      const targetHeadYaw = -mouseNdcX * this.config.headYawLimit;
      const targetHeadPitch = mouseNdcY * this.config.headPitchLimit;
      const targetSpineYaw = -mouseNdcX * this.config.spineYawLimit;

      // Smooth interpolation
      const headT = Math.min(1, delta * this.config.headSmoothness);
      const spineT = Math.min(1, delta * this.config.spineSmoothness);

      this._headYaw = lerp(this._headYaw, targetHeadYaw, headT);
      this._headPitch = lerp(this._headPitch, targetHeadPitch, headT);
      this._spineYaw = lerp(this._spineYaw, targetSpineYaw, spineT);

      // Eye-lead: eyes should be ahead of current head rotation
      this._eyeLeadYaw = (targetHeadYaw - this._headYaw) * this.config.eyeLeadFactor;
      this._eyeLeadPitch = (targetHeadPitch - this._headPitch) * this.config.eyeLeadFactor;
    }

    // Apply additives
    this._applyAdditives();
  }

  /**
   * Get the eye-lead yaw/pitch offsets in degrees.
   * Eyes should look slightly ahead of where the head is pointing.
   * Returns the difference between target angles and current smoothed angles,
   * scaled by the eyeLeadFactor.
   */
  getEyeLeadOffset(): { yaw: number; pitch: number } {
    return {
      yaw: this._eyeLeadYaw,
      pitch: this._eyeLeadPitch,
    };
  }

  dispose(): void {
    this._undoAdditives();
    this._initialized = false;
    this._headBone = null;
    this._spineBone = null;
    this._chestBone = null;
  }

  private _applyAdditives(): void {
    const DEG2RAD = Math.PI / 180;

    // Head: yaw (Y-axis) + pitch (X-axis)
    if (this._headBone) {
      this._headAdd.setFromEuler(
        new THREE.Euler(
          this._headPitch * DEG2RAD * this.config.headBlend,
          this._headYaw * DEG2RAD * this.config.headBlend,
          0,
          "YXZ",
        ),
      );
      this._headBone.quaternion.multiply(this._headAdd);
    }

    // Spine: yaw only
    if (this._spineBone && this.config.spineEnabled) {
      this._spineAdd.setFromEuler(
        new THREE.Euler(
          0,
          this._spineYaw * DEG2RAD * this.config.spineBlend,
          0,
        ),
      );
      this._spineBone.quaternion.multiply(this._spineAdd);
    }

    // Chest: follows spine at reduced factor
    if (this._chestBone && this.config.spineEnabled) {
      this._chestAdd.setFromEuler(
        new THREE.Euler(
          0,
          this._spineYaw * DEG2RAD * this.config.spineBlend * this.config.chestFactor,
          0,
        ),
      );
      this._chestBone.quaternion.multiply(this._chestAdd);
    }
  }

  private _undoAdditives(): void {
    if (this._headBone && !isIdentity(this._headAdd)) {
      this._headBone.quaternion.multiply(this._headAdd.clone().invert());
    }
    if (this._spineBone && !isIdentity(this._spineAdd)) {
      this._spineBone.quaternion.multiply(this._spineAdd.clone().invert());
    }
    if (this._chestBone && !isIdentity(this._chestAdd)) {
      this._chestBone.quaternion.multiply(this._chestAdd.clone().invert());
    }
    this._headAdd.identity();
    this._spineAdd.identity();
    this._chestAdd.identity();
  }
}

// ---------- Utility ----------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function isIdentity(q: THREE.Quaternion): boolean {
  return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1;
}
