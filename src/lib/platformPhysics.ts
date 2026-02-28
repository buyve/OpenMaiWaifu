/**
 * 2D Platform Physics Engine — treats desktop windows as physical platforms.
 *
 * The screen is modelled as a 2D platformer world:
 * - Window top edges = horizontal platforms (one-way, land from above)
 * - Window side edges = vertical walls
 * - Taskbar = floor platform
 * - Screen boundaries = walls / floor / ceiling
 *
 * Character has velocity, gravity, and AABB collision detection.
 * Runs per-frame (60 Hz) independently from the behavior tick (1 Hz).
 */

import {
  PHYSICS_GRAVITY,
  PHYSICS_TERMINAL_VELOCITY,
  PHYSICS_GROUND_FRICTION,
  PHYSICS_AIR_FRICTION,
  PHYSICS_PLATFORM_THICKNESS,
  PHYSICS_COLLISION_SKIN,
  PHYSICS_EDGE_SNAP_DISTANCE,
  PHYSICS_CHAR_WIDTH,
  PHYSICS_CHAR_HEIGHT,
} from "./constants";

// ---------- Types ----------

export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  groundPlatform: Platform | null;
}

export type PlatformType =
  | "window_top"
  | "window_left"
  | "window_right"
  | "taskbar"
  | "screen_floor"
  | "screen_left"
  | "screen_right"
  | "screen_top";

export interface Platform {
  id: string;
  type: PlatformType;
  /** Left edge in world-space. */
  x: number;
  /** Top edge in world-space (higher Y = higher on screen). */
  y: number;
  /** World-space width. */
  width: number;
  /** World-space height (thickness for platforms, full height for walls). */
  height: number;
  /** Links back to the source window for tracking. */
  sourceWindowId?: number;
  /** True for vertical surfaces (window sides, screen edges). */
  isWall: boolean;
}

export interface PhysicsStepResult {
  /** Character just landed on a surface this frame. */
  landed: boolean;
  /** Character just left a surface (or it disappeared). */
  startedFalling: boolean;
  /** Within edge-snap distance of platform's left end. */
  nearLeftEdge: boolean;
  /** Within edge-snap distance of platform's right end. */
  nearRightEdge: boolean;
  /** Collided with a wall on the left. */
  hitWallLeft: boolean;
  /** Collided with a wall on the right. */
  hitWallRight: boolean;
  /** The wall platform that was hit (null for screen boundaries). */
  hitWallPlatform: Platform | null;
  /** The platform the character is standing on (if any). */
  groundPlatform: Platform | null;
}

export interface ScreenEdgeState {
  nearLeft: boolean;
  nearRight: boolean;
  distanceToEdge: number;
  edgeSide: "left" | "right" | null;
}

export interface WindowInfoForPhysics {
  window_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenSizeForPhysics {
  width: number;
  height: number;
}

// ---------- Constants ----------

/** Maximum physics delta time to prevent tunneling on lag spikes. */
const MAX_DT = 1 / 30;

/** Default taskbar height in screen pixels when no value is provided. */
const DEFAULT_TASKBAR_HEIGHT_PX = 70;

// ---------- Class ----------

export class PlatformPhysics {
  private _body: PhysicsBody;
  private _platforms: Platform[] = [];
  private _enabled = true;
  private _frozen = false; // true during drag
  /** True after the first successful rebuildPlatforms() call. */
  private _platformsBuilt = false;
  /** Previous frame's Y position for accurate one-way platform detection. */
  private _prevY = 0;

  // Screen boundaries in world-space (updated on rebuildPlatforms)
  private _screenLeft = -1;
  private _screenRight = 1;
  private _screenBottom = 0;

  // Hash of the last window list to skip unnecessary rebuilds
  private _lastWindowHash = 0;

  constructor() {
    this._body = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      width: PHYSICS_CHAR_WIDTH,
      height: PHYSICS_CHAR_HEIGHT,
      grounded: true,
      groundPlatform: null,
    };
  }

  // ---- Platform Management ----

  /**
   * Rebuild all platforms from the current window list + screen bounds.
   * Called every ~250ms when the window list updates.
   * Skips rebuild if the window positions haven't changed (hash check).
   *
   * @returns true if platforms were rebuilt, false if skipped.
   */
  rebuildPlatforms(
    windows: WindowInfoForPhysics[],
    screenSize: ScreenSizeForPhysics,
    screenToWorld: (sx: number, sy: number) => { x: number; y: number },
    taskbarHeightPx: number = DEFAULT_TASKBAR_HEIGHT_PX,
  ): boolean {
    // Hash-based skip: avoid rebuilding when windows haven't changed.
    // Include a camera-derived component so zoom/resize changes trigger rebuilds:
    // screenToWorld(0,0) produces different world coords when the camera frustum changes.
    const cameraCheck = screenToWorld(0, 0);
    const cameraComponent =
      (Math.round(cameraCheck.x * 1000) | 0) ^
      ((Math.round(cameraCheck.y * 1000) | 0) << 16);
    const newHash = (this._hashWindowList(windows, screenSize, taskbarHeightPx) ^ cameraComponent) | 0;
    if (newHash === this._lastWindowHash && this._platforms.length > 0) {
      return false;
    }
    this._lastWindowHash = newHash;

    const platforms: Platform[] = [];

    // Compute screen boundaries in world-space
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(screenSize.width, screenSize.height);
    const screenWidth = Math.abs(bottomRight.x - topLeft.x);

    this._screenLeft = topLeft.x;
    this._screenRight = bottomRight.x;
    this._screenBottom = bottomRight.y;

    // Screen floor
    platforms.push({
      id: "screen_floor",
      type: "screen_floor",
      x: topLeft.x,
      y: bottomRight.y,
      width: screenWidth,
      height: PHYSICS_PLATFORM_THICKNESS,
      isWall: false,
    });

    // Screen left wall
    platforms.push({
      id: "screen_left",
      type: "screen_left",
      x: topLeft.x - PHYSICS_PLATFORM_THICKNESS,
      y: topLeft.y,
      width: PHYSICS_PLATFORM_THICKNESS,
      height: Math.abs(topLeft.y - bottomRight.y),
      isWall: true,
    });

    // Screen right wall
    platforms.push({
      id: "screen_right",
      type: "screen_right",
      x: bottomRight.x,
      y: topLeft.y,
      width: PHYSICS_PLATFORM_THICKNESS,
      height: Math.abs(topLeft.y - bottomRight.y),
      isWall: true,
    });

    // Screen top (ceiling)
    platforms.push({
      id: "screen_top",
      type: "screen_top",
      x: topLeft.x,
      y: topLeft.y + PHYSICS_PLATFORM_THICKNESS,
      width: screenWidth,
      height: PHYSICS_PLATFORM_THICKNESS,
      isWall: false,
    });

    // Taskbar platform (above the Dock)
    const taskbarWorld = screenToWorld(0, screenSize.height - taskbarHeightPx);
    platforms.push({
      id: "taskbar",
      type: "taskbar",
      x: topLeft.x,
      y: taskbarWorld.y,
      width: screenWidth,
      height: PHYSICS_PLATFORM_THICKNESS,
      isWall: false,
    });

    // Window platforms
    for (const win of windows) {
      const wTL = screenToWorld(win.x, win.y);
      const wBR = screenToWorld(win.x + win.width, win.y + win.height);
      const worldW = Math.abs(wBR.x - wTL.x);
      const worldH = Math.abs(wTL.y - wBR.y);

      // Top edge = horizontal platform
      platforms.push({
        id: `win_top_${win.window_id}`,
        type: "window_top",
        x: wTL.x,
        y: wTL.y,
        width: worldW,
        height: PHYSICS_PLATFORM_THICKNESS,
        sourceWindowId: win.window_id,
        isWall: false,
      });

      // Left edge = vertical wall
      platforms.push({
        id: `win_left_${win.window_id}`,
        type: "window_left",
        x: wTL.x - PHYSICS_PLATFORM_THICKNESS,
        y: wTL.y,
        width: PHYSICS_PLATFORM_THICKNESS,
        height: worldH,
        sourceWindowId: win.window_id,
        isWall: true,
      });

      // Right edge = vertical wall
      platforms.push({
        id: `win_right_${win.window_id}`,
        type: "window_right",
        x: wBR.x,
        y: wTL.y,
        width: PHYSICS_PLATFORM_THICKNESS,
        height: worldH,
        sourceWindowId: win.window_id,
        isWall: true,
      });
    }

    // Check if current ground platform still exists
    if (this._body.grounded && this._body.groundPlatform) {
      const oldId = this._body.groundPlatform.id;
      const stillExists = platforms.some((p) => p.id === oldId);
      if (!stillExists) {
        // Don't clear grounded here — let step() detect the transition
        // so that startedFalling is correctly reported.
        this._body.groundPlatform = null;
      } else {
        // Update ground platform reference to new instance
        const updated = platforms.find((p) => p.id === oldId);
        if (updated) {
          // Apply platform movement delta to character X so it rides the window
          const deltaX = updated.x - this._body.groundPlatform!.x;
          if (deltaX !== 0) {
            this._body.x += deltaX;
          }
          this._body.groundPlatform = updated;
          // Snap Y to updated platform position
          this._body.y = updated.y + PHYSICS_COLLISION_SKIN;
        }
      }
    }

    this._platforms = platforms;
    this._platformsBuilt = true;
    return true;
  }

  /** Whether platforms have been built at least once. */
  isPlatformsBuilt(): boolean {
    return this._platformsBuilt;
  }

  /** Fast hash of window positions to detect changes. */
  private _hashWindowList(
    windows: WindowInfoForPhysics[],
    screenSize: ScreenSizeForPhysics,
    taskbarHeightPx: number = DEFAULT_TASKBAR_HEIGHT_PX,
  ): number {
    let hash = screenSize.width ^ (screenSize.height << 16) ^ (taskbarHeightPx << 8);
    for (const w of windows) {
      // XOR window_id with position (2px grid) to detect moves
      hash ^= w.window_id;
      hash = (hash << 5) - hash + (Math.floor(w.x / 2) | 0);
      hash = (hash << 5) - hash + (Math.floor(w.y / 2) | 0);
      hash = (hash << 5) - hash + (Math.floor(w.width / 2) | 0);
      hash = (hash << 5) - hash + (Math.floor(w.height / 2) | 0);
      hash |= 0; // Force 32-bit integer
    }
    return hash;
  }

  getPlatforms(): ReadonlyArray<Platform> {
    return this._platforms;
  }

  // ---- Physics Step ----

  /**
   * Advance physics simulation by `dt` seconds.
   * Must be called every frame (~60 Hz).
   */
  step(dt: number): PhysicsStepResult {
    const result: PhysicsStepResult = {
      landed: false,
      startedFalling: false,
      nearLeftEdge: false,
      nearRightEdge: false,
      hitWallLeft: false,
      hitWallRight: false,
      hitWallPlatform: null,
      groundPlatform: null,
    };

    if (!this._enabled || this._frozen || !this._platformsBuilt) {
      result.groundPlatform = this._body.groundPlatform;
      return result;
    }

    // Clamp dt to prevent tunneling on lag spikes
    const clampedDt = Math.min(dt, MAX_DT);
    const body = this._body;
    const wasGrounded = body.grounded;

    // 1. Apply gravity (only when airborne)
    if (!body.grounded) {
      body.vy += PHYSICS_GRAVITY * clampedDt;
      // Clamp to terminal velocity
      if (body.vy < PHYSICS_TERMINAL_VELOCITY) {
        body.vy = PHYSICS_TERMINAL_VELOCITY;
      }
    }

    // 2. Apply friction
    if (body.grounded) {
      const friction = 1 - PHYSICS_GROUND_FRICTION * clampedDt;
      body.vx *= Math.max(0, friction);
      if (Math.abs(body.vx) < 0.001) body.vx = 0;
    } else {
      const airFriction = 1 - PHYSICS_AIR_FRICTION * clampedDt;
      body.vx *= Math.max(0, airFriction);
    }

    // 3. Integrate position
    this._prevY = body.y; // save pre-integration Y for platform detection
    body.x += body.vx * clampedDt;
    body.y += body.vy * clampedDt;

    // 4. Collision detection & response
    this._resolveCollisions(body, result);

    // 5. Ground tracking: if grounded and platform moved, snap Y
    if (body.grounded && body.groundPlatform) {
      body.y = body.groundPlatform.y + PHYSICS_COLLISION_SKIN;
    }

    // 5b. Absolute floor safety net: clamp body to screen bottom no matter what.
    // This catches any edge case where _resolveCollisions might miss the floor
    // (e.g. due to tunneling, incorrect platform positions, or timing issues).
    if (!body.grounded && body.y < this._screenBottom) {
      body.y = this._screenBottom + PHYSICS_COLLISION_SKIN;
      body.vy = 0;
      body.grounded = true;
      body.groundPlatform =
        this._platforms.find((p) => p.type === "screen_floor") ?? null;
    }

    // 6. Detect state transitions
    if (!wasGrounded && body.grounded) {
      result.landed = true;
    }
    if (wasGrounded && !body.grounded) {
      result.startedFalling = true;
    }

    // 7. Edge detection
    if (body.grounded && body.groundPlatform) {
      const plat = body.groundPlatform;
      const distToLeft = body.x - plat.x;
      const distToRight = plat.x + plat.width - body.x;
      result.nearLeftEdge = distToLeft < PHYSICS_EDGE_SNAP_DISTANCE;
      result.nearRightEdge = distToRight < PHYSICS_EDGE_SNAP_DISTANCE;
    }

    result.groundPlatform = body.groundPlatform;
    return result;
  }

  // ---- Collision Detection ----

  private _resolveCollisions(
    body: PhysicsBody,
    result: PhysicsStepResult,
  ): void {
    body.grounded = false;
    body.groundPlatform = null;

    const halfW = body.width / 2;
    const bodyLeft = body.x - halfW;
    const bodyRight = body.x + halfW;
    const bodyBottom = body.y;
    const bodyTop = body.y + body.height;

    // Sort platforms by Y descending so we land on the highest one first
    const horizontalPlatforms = this._platforms
      .filter((p) => !p.isWall)
      .sort((a, b) => b.y - a.y);

    // Maximum movement per frame at terminal velocity + MAX_DT.
    // Used to size the one-way platform detection window so the character
    // can't tunnel through thin platforms at high speed or low FPS.
    const maxMovePerStep = Math.abs(PHYSICS_TERMINAL_VELOCITY) * MAX_DT;

    // Check horizontal platforms (one-way: only collide when falling)
    for (const plat of horizontalPlatforms) {
      const platLeft = plat.x;
      const platRight = plat.x + plat.width;
      const platTop = plat.y + plat.height;

      // Horizontal overlap check
      if (bodyRight <= platLeft || bodyLeft >= platRight) continue;

      // One-way platform: only collide from above (falling downward or stationary)
      if (body.vy <= 0) {
        // Use the actual previous frame Y for accurate crossing detection.
        const previousBottom = this._prevY;

        // Landing conditions:
        // 1. Current position is at or below the platform surface (+skin tolerance)
        // 2. Previous position was within one maxMovePerStep of the surface from above
        //    (prevents landing when jumping from far below the platform)
        if (
          bodyBottom <= platTop + PHYSICS_COLLISION_SKIN &&
          previousBottom >= platTop - maxMovePerStep
        ) {
          body.y = platTop + PHYSICS_COLLISION_SKIN;
          body.vy = 0;
          body.grounded = true;
          body.groundPlatform = plat;
          break; // Land on the highest platform
        }
      }
    }

    // Check vertical walls
    const walls = this._platforms.filter((p) => p.isWall);
    for (const wall of walls) {
      const wallLeft = wall.x;
      const wallRight = wall.x + wall.width;
      const wallTop = wall.y;
      const wallBottom = wall.y - wall.height;

      // Vertical overlap check
      if (bodyTop <= wallBottom || bodyBottom >= wallTop) continue;

      // Check horizontal collision
      if (bodyRight > wallLeft && bodyLeft < wallRight) {
        // Determine which side to push out from
        const overlapLeft = bodyRight - wallLeft;
        const overlapRight = wallRight - bodyLeft;

        if (overlapLeft < overlapRight) {
          // Push left
          body.x = wallLeft - halfW - PHYSICS_COLLISION_SKIN;
          if (body.vx > 0) body.vx = 0;
          result.hitWallRight = true;
        } else {
          // Push right
          body.x = wallRight + halfW + PHYSICS_COLLISION_SKIN;
          if (body.vx < 0) body.vx = 0;
          result.hitWallLeft = true;
        }
        // Only set hitWallPlatform for window walls (not screen boundaries)
        if (
          wall.type === "window_left" ||
          wall.type === "window_right"
        ) {
          result.hitWallPlatform = wall;
        }
      }
    }

    // Fallback: keep within screen boundaries
    if (body.x - halfW < this._screenLeft) {
      body.x = this._screenLeft + halfW + PHYSICS_COLLISION_SKIN;
      if (body.vx < 0) body.vx = 0;
      result.hitWallLeft = true;
    }
    if (body.x + halfW > this._screenRight) {
      body.x = this._screenRight - halfW - PHYSICS_COLLISION_SKIN;
      if (body.vx > 0) body.vx = 0;
      result.hitWallRight = true;
    }
    if (body.y < this._screenBottom) {
      body.y = this._screenBottom + PHYSICS_COLLISION_SKIN;
      body.vy = 0;
      body.grounded = true;
      // Use screen floor as ground platform
      body.groundPlatform =
        this._platforms.find((p) => p.type === "screen_floor") ?? null;
    }
  }

  // ---- Character Control ----

  /**
   * Get the Y position of the taskbar platform surface.
   * Returns null if no taskbar platform has been built yet.
   */
  getTaskbarY(): number | null {
    const taskbar = this._platforms.find((p) => p.type === "taskbar");
    return taskbar ? taskbar.y : null;
  }

  /** Directly set character position (for drag, teleport). */
  setPosition(x: number, y: number): void {
    this._body.x = x;
    this._body.y = y;
    this._body.vx = 0;
    this._body.vy = 0;
    this._prevY = y;
  }

  /** Get the current physics body state. */
  getBody(): Readonly<PhysicsBody> {
    return this._body;
  }

  /** Enable/disable the physics system. */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  /** Freeze physics during drag. */
  onDragStart(): void {
    this._frozen = true;
    this._body.vx = 0;
    this._body.vy = 0;
  }

  /** Resume physics after drag ends. */
  onDragEnd(velocityX: number, velocityY: number): void {
    this._frozen = false;
    // Keep grounded = true so the next step() can detect the wasGrounded→!grounded
    // transition and properly fire startedFalling (which triggers the "falling"
    // behavior state). Collision resolution will set grounded to false if the
    // character is not on a platform.
    this._body.grounded = true;
    this._body.groundPlatform = null;
    this._body.vx = velocityX;
    this._body.vy = velocityY;
  }

  /** Check how close the character is to screen edges. */
  getScreenEdgeState(): ScreenEdgeState {
    const body = this._body;
    const halfW = body.width / 2;

    const distLeft = body.x - halfW - this._screenLeft;
    const distRight = this._screenRight - (body.x + halfW);
    const minDist = Math.min(distLeft, distRight);

    let edgeSide: "left" | "right" | null = null;
    if (distLeft < PHYSICS_EDGE_SNAP_DISTANCE) edgeSide = "left";
    else if (distRight < PHYSICS_EDGE_SNAP_DISTANCE) edgeSide = "right";

    return {
      nearLeft: distLeft < PHYSICS_EDGE_SNAP_DISTANCE,
      nearRight: distRight < PHYSICS_EDGE_SNAP_DISTANCE,
      distanceToEdge: Math.max(0, minDist),
      edgeSide,
    };
  }

}
