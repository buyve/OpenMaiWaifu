/**
 * Hand Reach System — procedural IK-like arm reaching toward mouse.
 *
 * When the mouse cursor is within a certain distance of the character (above waist),
 * the closest arm's shoulder + elbow are additively rotated to point toward the mouse.
 * Uses a simple 2-joint CCD (Cyclic Coordinate Descent) approach.
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

// ---------- Constants ----------

/** Minimum distance from character center to activate reach (world-units). */
const REACH_MIN_DIST = 0.3;

/** Maximum distance from character center for reach (world-units). */
const REACH_MAX_DIST = 1.0;

/** Minimum Y world-coordinate for reach (above waist only). */
const REACH_MIN_Y = 0.6;

/** Maximum additive rotation in radians for shoulder. */
const SHOULDER_MAX_RAD = 60 * (Math.PI / 180);

/** Maximum additive rotation in radians for elbow. */
const ELBOW_MAX_RAD = 45 * (Math.PI / 180);

/** Smoothing speed (higher = faster response). */
const SMOOTH_SPEED = 6;

// ---------- Helpers ----------

const _tmpEuler = new THREE.Euler();

function clampRad(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------- Class ----------

export class HandReach {
  // Bone references
  private _leftShoulder: THREE.Object3D | null = null;
  private _leftElbow: THREE.Object3D | null = null;
  private _rightShoulder: THREE.Object3D | null = null;
  private _rightElbow: THREE.Object3D | null = null;

  // Current additive rotations (smoothed)
  private _lShoulderPitch = 0;
  private _lShoulderYaw = 0;
  private _lElbowPitch = 0;
  private _rShoulderPitch = 0;
  private _rShoulderYaw = 0;
  private _rElbowPitch = 0;

  // Previous frame additives (for undo)
  private _lShoulderAdd = new THREE.Quaternion();
  private _lElbowAdd = new THREE.Quaternion();
  private _rShoulderAdd = new THREE.Quaternion();
  private _rElbowAdd = new THREE.Quaternion();

  private _initialized = false;

  init(vrm: VRM): void {
    const h = vrm.humanoid;
    if (!h) return;

    this._leftShoulder = h.getNormalizedBoneNode("leftUpperArm");
    this._leftElbow = h.getNormalizedBoneNode("leftLowerArm");
    this._rightShoulder = h.getNormalizedBoneNode("rightUpperArm");
    this._rightElbow = h.getNormalizedBoneNode("rightLowerArm");

    this._lShoulderPitch = 0;
    this._lShoulderYaw = 0;
    this._lElbowPitch = 0;
    this._rShoulderPitch = 0;
    this._rShoulderYaw = 0;
    this._rElbowPitch = 0;
    this._lShoulderAdd.identity();
    this._lElbowAdd.identity();
    this._rShoulderAdd.identity();
    this._rElbowAdd.identity();

    this._initialized = true;
  }

  /**
   * @param mouseWorldX - Mouse X in world-space
   * @param mouseWorldY - Mouse Y in world-space
   * @param charX - Character root X position
   * @param charY - Character root Y position
   * @param delta - Frame delta seconds
   * @param isDragging - Disable during drag
   */
  update(
    mouseWorldX: number,
    mouseWorldY: number,
    charX: number,
    charY: number,
    delta: number,
    isDragging: boolean,
  ): void {
    if (!this._initialized) return;

    // Undo previous additives
    this._undoAdditives();

    // Compute distance from character center
    const dx = mouseWorldX - charX;
    const dy = mouseWorldY - (charY + 1.0); // offset to chest height
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Target blend based on distance (1 at REACH_MIN_DIST, 0 at REACH_MAX_DIST)
    let blend = 0;
    if (!isDragging && dist >= REACH_MIN_DIST && dist <= REACH_MAX_DIST && mouseWorldY > charY + REACH_MIN_Y) {
      blend = 1.0 - (dist - REACH_MIN_DIST) / (REACH_MAX_DIST - REACH_MIN_DIST);
    }

    // Determine which arm to use (closest side)
    const useLeft = dx < 0;

    // Target angles
    const targetPitch = clampRad(-Math.atan2(dy, Math.abs(dx)) * blend, SHOULDER_MAX_RAD);
    const targetYaw = clampRad(Math.atan2(dx, 0.5) * blend * 0.5, SHOULDER_MAX_RAD);
    const targetElbow = clampRad(blend * 0.3, ELBOW_MAX_RAD);

    const t = Math.min(1, SMOOTH_SPEED * delta);

    if (useLeft) {
      this._lShoulderPitch = lerp(this._lShoulderPitch, targetPitch, t);
      this._lShoulderYaw = lerp(this._lShoulderYaw, targetYaw, t);
      this._lElbowPitch = lerp(this._lElbowPitch, targetElbow, t);
      // Decay right arm
      this._rShoulderPitch = lerp(this._rShoulderPitch, 0, t);
      this._rShoulderYaw = lerp(this._rShoulderYaw, 0, t);
      this._rElbowPitch = lerp(this._rElbowPitch, 0, t);
    } else {
      this._rShoulderPitch = lerp(this._rShoulderPitch, targetPitch, t);
      this._rShoulderYaw = lerp(this._rShoulderYaw, -targetYaw, t);
      this._rElbowPitch = lerp(this._rElbowPitch, targetElbow, t);
      // Decay left arm
      this._lShoulderPitch = lerp(this._lShoulderPitch, 0, t);
      this._lShoulderYaw = lerp(this._lShoulderYaw, 0, t);
      this._lElbowPitch = lerp(this._lElbowPitch, 0, t);
    }

    // Apply additives
    this._applyAdditives();
  }

  dispose(): void {
    this._undoAdditives();
    this._initialized = false;
    this._leftShoulder = null;
    this._leftElbow = null;
    this._rightShoulder = null;
    this._rightElbow = null;
  }

  private _applyAdditives(): void {
    // Left shoulder
    if (this._leftShoulder && (this._lShoulderPitch !== 0 || this._lShoulderYaw !== 0)) {
      _tmpEuler.set(this._lShoulderPitch, this._lShoulderYaw, 0, "YXZ");
      this._lShoulderAdd.setFromEuler(_tmpEuler);
      this._leftShoulder.quaternion.multiply(this._lShoulderAdd);
    }

    // Left elbow
    if (this._leftElbow && this._lElbowPitch !== 0) {
      _tmpEuler.set(this._lElbowPitch, 0, 0);
      this._lElbowAdd.setFromEuler(_tmpEuler);
      this._leftElbow.quaternion.multiply(this._lElbowAdd);
    }

    // Right shoulder
    if (this._rightShoulder && (this._rShoulderPitch !== 0 || this._rShoulderYaw !== 0)) {
      _tmpEuler.set(this._rShoulderPitch, this._rShoulderYaw, 0, "YXZ");
      this._rShoulderAdd.setFromEuler(_tmpEuler);
      this._rightShoulder.quaternion.multiply(this._rShoulderAdd);
    }

    // Right elbow
    if (this._rightElbow && this._rElbowPitch !== 0) {
      _tmpEuler.set(this._rElbowPitch, 0, 0);
      this._rElbowAdd.setFromEuler(_tmpEuler);
      this._rightElbow.quaternion.multiply(this._rElbowAdd);
    }
  }

  private _undoAdditives(): void {
    if (this._leftShoulder && !isIdentity(this._lShoulderAdd)) {
      this._leftShoulder.quaternion.multiply(this._lShoulderAdd.clone().invert());
    }
    if (this._leftElbow && !isIdentity(this._lElbowAdd)) {
      this._leftElbow.quaternion.multiply(this._lElbowAdd.clone().invert());
    }
    if (this._rightShoulder && !isIdentity(this._rShoulderAdd)) {
      this._rightShoulder.quaternion.multiply(this._rShoulderAdd.clone().invert());
    }
    if (this._rightElbow && !isIdentity(this._rElbowAdd)) {
      this._rightElbow.quaternion.multiply(this._rElbowAdd.clone().invert());
    }
    this._lShoulderAdd.identity();
    this._lElbowAdd.identity();
    this._rShoulderAdd.identity();
    this._rElbowAdd.identity();
  }
}

function isIdentity(q: THREE.Quaternion): boolean {
  return q.x === 0 && q.y === 0 && q.z === 0 && q.w === 1;
}
