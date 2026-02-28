/**
 * SpringBone Gravity — Apply external forces to VRM spring bones during drag
 * Ported from Mate-Engine's AvatarGravityController.cs
 *
 * When the character is dragged, hair and clothes react to the movement
 * direction via VRM spring bone external force / gravity overrides.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
// VRMSpringBoneJoint type used for spring bone manipulation

// ---------- Config ----------

export interface SpringBoneGravityConfig {
  enabled: boolean;
  /** How much drag velocity affects spring bones. Default 0.05 */
  impactMultiplier: number;
  /** Smoothing factor for the force. Default 8 */
  smoothness: number;
}

const DEFAULT_CONFIG: SpringBoneGravityConfig = {
  enabled: true,
  impactMultiplier: 0.05,
  smoothness: 8,
};

// ---------- Class ----------

export class SpringBoneGravity {
  config: SpringBoneGravityConfig;

  private _vrm: VRM | null = null;
  private _prevCharX = 0;
  private _prevCharY = 0;
  private _hasInit = false;
  private _currentForce = new THREE.Vector3();
  private _smoothedForce = new THREE.Vector3();

  constructor(config?: Partial<SpringBoneGravityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(vrm: VRM): void {
    this._vrm = vrm;
    this._hasInit = false;
  }

  /**
   * Call every frame.
   * @param charX - Character root world X position
   * @param charY - Character root world Y position
   * @param isDragging - Whether character is being dragged
   * @param delta - Frame delta seconds
   */
  update(charX: number, charY: number, isDragging: boolean, delta: number): void {
    if (!this.config.enabled || !this._vrm) return;

    if (!this._hasInit) {
      this._prevCharX = charX;
      this._prevCharY = charY;
      this._hasInit = true;
      return;
    }

    const dx = charX - this._prevCharX;
    const dy = charY - this._prevCharY;
    this._prevCharX = charX;
    this._prevCharY = charY;

    if (isDragging && (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001)) {
      // Movement direction as force (invert X so hair swings opposite to movement)
      this._currentForce.set(
        -dx * this.config.impactMultiplier,
        dy * this.config.impactMultiplier,
        0,
      ).normalize().multiplyScalar(this.config.impactMultiplier);
    } else {
      this._currentForce.set(0, 0, 0);
    }

    // Smooth the force
    const t = Math.min(1, delta * this.config.smoothness);
    this._smoothedForce.lerp(this._currentForce, t);

    // Apply to VRM spring bones
    this._applyToSpringBones();
  }

  dispose(): void {
    // Reset spring bone gravity to default
    if (this._vrm?.springBoneManager) {
      for (const joint of this._vrm.springBoneManager.joints) {
        if (joint.settings) {
          joint.settings.gravityDir = new THREE.Vector3(0, -1, 0);
          joint.settings.gravityPower = 0;
        }
      }
    }
    this._vrm = null;
  }

  private _applyToSpringBones(): void {
    if (!this._vrm?.springBoneManager) return;

    const force = this._smoothedForce;
    const magnitude = force.length();

    if (magnitude < 0.0001) return;

    for (const joint of this._vrm.springBoneManager.joints) {
      if (!joint.settings) continue;
      // Override gravity direction and power with drag force
      joint.settings.gravityDir = force.clone().normalize();
      joint.settings.gravityPower = magnitude;
    }
  }
}
