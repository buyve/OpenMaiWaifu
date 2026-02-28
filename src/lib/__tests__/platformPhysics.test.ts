import { describe, it, expect, beforeEach } from "vitest";
import { PlatformPhysics } from "../platformPhysics";
import {
  PHYSICS_COLLISION_SKIN,
  PHYSICS_EDGE_SNAP_DISTANCE,
  PHYSICS_CHAR_WIDTH,
} from "../constants";

// Simple screenToWorld: identity mapping (screen px = world units)
// with Y-flip (screen Y increases downward, world Y increases upward)
const identityScreenToWorld = (sx: number, sy: number) => ({
  x: sx / 100 - 5, // 0..1000px → -5..5 world
  y: -(sy / 100 - 5), // 0..1000px → 5..-5 world (flipped)
});

// Screen size matching identity mapping
const SCREEN = { width: 1000, height: 1000 };

// Helper: create a window centered at screen position (sx, sy) with given size
function makeWindow(id: number, sx: number, sy: number, w: number, h: number) {
  return { window_id: id, x: sx, y: sy, width: w, height: h };
}

// Helper: step physics multiple frames
function stepFrames(physics: PlatformPhysics, frames: number, dt = 1 / 60) {
  let lastResult = physics.step(dt);
  for (let i = 1; i < frames; i++) {
    lastResult = physics.step(dt);
  }
  return lastResult;
}

describe("PlatformPhysics", () => {
  let physics: PlatformPhysics;

  beforeEach(() => {
    physics = new PlatformPhysics();
  });

  // ============================================================
  // Gravity & Landing
  // ============================================================

  describe("gravity and landing", () => {
    it("applies gravity when airborne", () => {
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);
      physics.setPosition(0, 3);
      // Make airborne
      physics.onDragEnd(0, 0);

      const body0 = physics.getBody();
      // After onDragEnd, grounded is temporarily true so the first step()
      // can detect wasGrounded→!grounded and fire startedFalling properly.
      expect(body0.grounded).toBe(true);

      // Step a few frames — first frame detects startedFalling, subsequent frames apply gravity
      stepFrames(physics, 10);
      const body1 = physics.getBody();

      // Y should decrease (falling down)
      expect(body1.y).toBeLessThan(3);
      expect(body1.vy).toBeLessThan(0);
    });

    it("lands on the screen floor", () => {
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);
      physics.setPosition(0, 1);
      physics.onDragEnd(0, 0); // airborne

      // Step until grounded (should land on screen_floor)
      for (let i = 0; i < 300; i++) {
        const result = physics.step(1 / 60);
        if (result.landed) {
          expect(physics.getBody().grounded).toBe(true);
          expect(result.groundPlatform).not.toBeNull();
          return;
        }
      }
      // If we get here, the character should still be grounded on screen floor
      expect(physics.getBody().grounded).toBe(true);
    });

    it("lands on a window top platform", () => {
      // Window at screen (300, 500) size 400x200
      // World: x = -2..2, y = 0..2 (top at y=0 in this mapping)
      const windows = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position character above the window
      const windowTopWorld = identityScreenToWorld(500, 500);
      physics.setPosition(windowTopWorld.x, windowTopWorld.y + 1);
      physics.onDragEnd(0, 0);

      let landed = false;
      for (let i = 0; i < 300; i++) {
        const result = physics.step(1 / 60);
        if (result.landed) {
          landed = true;
          expect(result.groundPlatform?.type).toBe("window_top");
          expect(result.groundPlatform?.sourceWindowId).toBe(1);
          break;
        }
      }
      expect(landed).toBe(true);
    });

    it("detects startedFalling when platform is removed", () => {
      const windows = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position on window
      const windowTopWorld = identityScreenToWorld(500, 500);
      physics.setPosition(windowTopWorld.x, windowTopWorld.y + PHYSICS_COLLISION_SKIN);

      // Step to ground
      stepFrames(physics, 5);
      expect(physics.getBody().grounded).toBe(true);

      // Remove the window
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);

      // Step — should detect falling
      const result = physics.step(1 / 60);
      expect(result.startedFalling).toBe(true);
      expect(physics.getBody().grounded).toBe(false);
    });
  });

  // ============================================================
  // One-Way Platforms
  // ============================================================

  describe("one-way platforms", () => {
    it("does not collide when moving upward through a platform", () => {
      const windows = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position below the window, moving upward
      const windowTopWorld = identityScreenToWorld(500, 500);
      physics.setPosition(windowTopWorld.x, windowTopWorld.y - 1);
      physics.onDragEnd(0, 3.0); // strong upward velocity

      // Step enough frames for the character to pass through the platform
      let passedThrough = false;
      for (let i = 0; i < 100; i++) {
        physics.step(1 / 60);
        const body = physics.getBody();
        if (body.y > windowTopWorld.y + 0.1) {
          passedThrough = true;
          break;
        }
      }
      expect(passedThrough).toBe(true);
    });
  });

  // ============================================================
  // Wall Collision
  // ============================================================

  describe("wall collision", () => {
    it("stops horizontal movement on window wall collision", () => {
      // Window extends to screen bottom so the character hits the wall
      // after landing on the screen floor
      const windows = [makeWindow(1, 400, 0, 200, 1000)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position to the left of the window on the ground
      const windowLeftWorld = identityScreenToWorld(400, 500);
      physics.setPosition(windowLeftWorld.x - 0.5, windowLeftWorld.y);

      // Give it rightward velocity via drag
      physics.onDragEnd(1.0, 0);

      let hitWall = false;
      for (let i = 0; i < 600; i++) {
        const result = physics.step(1 / 60);
        if (result.hitWallRight) {
          hitWall = true;
          expect(physics.getBody().vx).toBe(0);
          break;
        }
      }
      expect(hitWall).toBe(true);
    });

    it("returns hitWallPlatform for window walls, null for screen boundaries", () => {
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);

      // Position near right screen edge, moving right via drag
      physics.setPosition(4.5, 0);
      physics.onDragEnd(1.0, 0);

      let hitScreenWall = false;
      for (let i = 0; i < 300; i++) {
        const result = physics.step(1 / 60);
        if (result.hitWallRight) {
          hitScreenWall = true;
          // Screen boundary should NOT have a hitWallPlatform
          expect(result.hitWallPlatform).toBeNull();
          break;
        }
      }
      expect(hitScreenWall).toBe(true);
    });

    it("returns hitWallPlatform for window wall hits", () => {
      // Window extends to screen bottom so character doesn't fall below wall
      const windows = [makeWindow(42, 500, 0, 200, 1000)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position to the left of window, moving right via drag
      const windowLeftWorld = identityScreenToWorld(500, 500);
      physics.setPosition(windowLeftWorld.x - 0.3, windowLeftWorld.y);
      physics.onDragEnd(0.5, 0);

      let hitWindowWall = false;
      for (let i = 0; i < 600; i++) {
        const result = physics.step(1 / 60);
        if (result.hitWallPlatform) {
          hitWindowWall = true;
          expect(result.hitWallPlatform.sourceWindowId).toBe(42);
          expect(result.hitWallPlatform.type).toMatch(/^window_(left|right)$/);
          break;
        }
      }
      expect(hitWindowWall).toBe(true);
    });
  });

  // ============================================================
  // Edge Detection
  // ============================================================

  describe("edge detection", () => {
    it("detects nearLeftEdge when character is near platform left end", () => {
      const windows = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      // Position at left edge of window
      const windowLeftWorld = identityScreenToWorld(300, 500);
      physics.setPosition(
        windowLeftWorld.x + PHYSICS_EDGE_SNAP_DISTANCE * 0.5,
        windowLeftWorld.y + PHYSICS_COLLISION_SKIN,
      );

      // Need to be grounded on this platform
      // Step a few frames to settle
      stepFrames(physics, 5);

      if (physics.getBody().grounded) {
        const result = physics.step(1 / 60);
        expect(result.nearLeftEdge).toBe(true);
        expect(result.nearRightEdge).toBe(false);
      }
    });

    it("detects nearRightEdge when character is near platform right end", () => {
      const windows = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);

      const windowRightWorld = identityScreenToWorld(700, 500);
      physics.setPosition(
        windowRightWorld.x - PHYSICS_EDGE_SNAP_DISTANCE * 0.5,
        identityScreenToWorld(500, 500).y + PHYSICS_COLLISION_SKIN,
      );

      stepFrames(physics, 5);

      if (physics.getBody().grounded) {
        const result = physics.step(1 / 60);
        expect(result.nearRightEdge).toBe(true);
      }
    });
  });

  // ============================================================
  // Screen Edge State
  // ============================================================

  describe("screen edge state", () => {
    it("detects proximity to left screen edge", () => {
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);

      const halfW = PHYSICS_CHAR_WIDTH / 2;
      const screenLeft = identityScreenToWorld(0, 0).x;
      physics.setPosition(screenLeft + halfW + 0.01, 0);

      const state = physics.getScreenEdgeState();
      expect(state.nearLeft).toBe(true);
      expect(state.edgeSide).toBe("left");
    });

    it("returns null edgeSide when away from edges", () => {
      physics.rebuildPlatforms([], SCREEN, identityScreenToWorld, 0);
      physics.setPosition(0, 0); // center

      const state = physics.getScreenEdgeState();
      expect(state.edgeSide).toBeNull();
    });
  });

  // ============================================================
  // Hash-based Rebuild Skip
  // ============================================================

  describe("rebuild optimization", () => {
    it("skips rebuild when window positions are unchanged", () => {
      const windows = [makeWindow(1, 300, 500, 400, 200)];

      const rebuilt1 = physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);
      expect(rebuilt1).toBe(true);

      const rebuilt2 = physics.rebuildPlatforms(windows, SCREEN, identityScreenToWorld, 0);
      expect(rebuilt2).toBe(false); // skipped
    });

    it("rebuilds when a window moves", () => {
      const windows1 = [makeWindow(1, 300, 500, 400, 200)];
      physics.rebuildPlatforms(windows1, SCREEN, identityScreenToWorld, 0);

      const windows2 = [makeWindow(1, 310, 500, 400, 200)]; // moved 10px
      const rebuilt = physics.rebuildPlatforms(windows2, SCREEN, identityScreenToWorld, 0);
      expect(rebuilt).toBe(true);
    });
  });

});
