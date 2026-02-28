/**
 * Headpat Detector — detects circular mouse motion over the character's head.
 *
 * Algorithm:
 * 1. Track mouse positions in a ring buffer (last 1s, ~60 points)
 * 2. When mouse is over the head zone, compute angular displacement via cross-product
 * 3. If cumulative angle ≥ 270°, trigger headpat
 * 4. 2s cooldown between headpats
 */

// ---------- Constants ----------

/** Maximum number of mouse positions to keep in the ring buffer. */
const BUFFER_SIZE = 60;

/** How long positions are kept before being considered stale (seconds). */
const BUFFER_LIFETIME = 1.0;

/** Minimum cumulative angle (degrees) to trigger a headpat. */
const TRIGGER_ANGLE_DEG = 270;

/** Cooldown between headpat triggers (seconds). */
const HEADPAT_COOLDOWN = 2.0;

/** Convert degrees to radians. */
const DEG2RAD = Math.PI / 180;

// ---------- Types ----------

interface BufferEntry {
  x: number;
  y: number;
  time: number;
}

export interface HeadpatDetectorConfig {
  /** Minimum cumulative angle to trigger (degrees). */
  triggerAngle?: number;
  /** Cooldown between triggers (seconds). */
  cooldown?: number;
}

// ---------- Class ----------

export class HeadpatDetector {
  private _buffer: BufferEntry[] = [];
  private _bufferIndex = 0;
  private _cooldownTimer = 0;
  private _triggerAngleRad: number;
  private _cooldown: number;
  private _isOverHead = false;

  /** Fired when a headpat is detected. */
  onHeadpat: (() => void) | null = null;

  constructor(config?: HeadpatDetectorConfig) {
    this._triggerAngleRad = (config?.triggerAngle ?? TRIGGER_ANGLE_DEG) * DEG2RAD;
    this._cooldown = config?.cooldown ?? HEADPAT_COOLDOWN;
    this._buffer = new Array(BUFFER_SIZE);
    this._bufferIndex = 0;
    for (let i = 0; i < BUFFER_SIZE; i++) {
      this._buffer[i] = { x: 0, y: 0, time: -Infinity };
    }
  }

  /** Update whether the mouse is currently over the head zone. */
  setOverHead(isOver: boolean): void {
    this._isOverHead = isOver;
    if (!isOver) {
      // Clear buffer when leaving head zone
      for (let i = 0; i < BUFFER_SIZE; i++) {
        this._buffer[i].time = -Infinity;
      }
    }
  }

  /**
   * Called every frame with the current mouse screen position and delta time.
   * Only processes when mouse is over the head zone.
   */
  update(mouseX: number, mouseY: number, delta: number): void {
    // Update cooldown
    if (this._cooldownTimer > 0) {
      this._cooldownTimer -= delta;
    }

    if (!this._isOverHead) return;

    const now = performance.now() / 1000;

    // Add position to ring buffer
    this._buffer[this._bufferIndex] = { x: mouseX, y: mouseY, time: now };
    this._bufferIndex = (this._bufferIndex + 1) % BUFFER_SIZE;

    // Only check if not on cooldown
    if (this._cooldownTimer > 0) return;

    // Compute cumulative angular displacement from valid entries
    const validEntries: BufferEntry[] = [];
    for (let i = 0; i < BUFFER_SIZE; i++) {
      if (now - this._buffer[i].time < BUFFER_LIFETIME) {
        validEntries.push(this._buffer[i]);
      }
    }

    if (validEntries.length < 10) return; // Need enough points

    // Sort by time
    validEntries.sort((a, b) => a.time - b.time);

    // Compute center of all points
    let cx = 0, cy = 0;
    for (const p of validEntries) {
      cx += p.x;
      cy += p.y;
    }
    cx /= validEntries.length;
    cy /= validEntries.length;

    // Compute cumulative signed angle using cross-product
    let totalAngle = 0;
    for (let i = 1; i < validEntries.length; i++) {
      const prev = validEntries[i - 1];
      const curr = validEntries[i];

      // Vectors from center to each point
      const ax = prev.x - cx;
      const ay = prev.y - cy;
      const bx = curr.x - cx;
      const by = curr.y - cy;

      // Cross product (z-component) gives sin(angle) * |a||b|
      const cross = ax * by - ay * bx;
      // Dot product gives cos(angle) * |a||b|
      const dot = ax * bx + ay * by;

      const angle = Math.atan2(cross, dot);
      totalAngle += angle;
    }

    // Check if cumulative angle exceeds threshold (in either direction)
    if (Math.abs(totalAngle) >= this._triggerAngleRad) {
      this._cooldownTimer = this._cooldown;
      // Clear buffer to prevent re-triggering
      for (let i = 0; i < BUFFER_SIZE; i++) {
        this._buffer[i].time = -Infinity;
      }
      this.onHeadpat?.();
    }
  }

  dispose(): void {
    this.onHeadpat = null;
  }
}
