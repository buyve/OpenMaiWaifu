import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import type { EmotionState } from "./useEmotion.ts";

// ---------- Types ----------

type TouchZone = "head" | "body" | "none";

export interface TouchReaction {
  zone: TouchZone;
  emotion: EmotionState;
  animation: string;
}

export interface UseTouchReactionReturn {
  /** The most recent touch reaction result. */
  lastReaction: TouchReaction | null;
  /** Process a touch hit on the character. Returns the reaction to apply. */
  handleTouch: (intersection: THREE.Intersection) => TouchReaction;
  /** Detect touch zone from a world-space hit point relative to the character base. */
  detectTouchZone: (
    hitPoint: THREE.Vector3,
    characterBase: THREE.Vector3,
  ) => TouchReaction;
}

// ---------- Zone thresholds (relative to character base Y) ----------

/** Y height above base that separates body from head zone. */
const HEAD_ZONE_THRESHOLD = 1.4;

/** Y height above base that separates ground from body zone. */
const BODY_ZONE_THRESHOLD = 0.5;

// ---------- Reaction definitions ----------

const REACTIONS: Record<TouchZone, TouchReaction> = {
  head: {
    zone: "head",
    emotion: "happy",
    animation: "liked",
  },
  body: {
    zone: "body",
    emotion: "surprised",
    animation: "laughing",
  },
  none: {
    zone: "none",
    emotion: "neutral",
    animation: "idle",
  },
};

// ---------- Hook ----------

/**
 * Provides touch zone detection and reaction mapping for the desktop pet.
 *
 * Touch zones are determined by the Y-coordinate of the hit point
 * relative to the character's base (feet) position:
 * - **Head zone** (y > 1.4): triggers happy emotion + headpat animation
 * - **Body zone** (0.5 < y < 1.4): triggers surprised/curious emotion + nod animation
 * - **None** (y < 0.5): no reaction (probably a miss)
 */
export function useTouchReaction(): UseTouchReactionReturn {
  const [lastReaction, setLastReaction] = useState<TouchReaction | null>(null);

  // Debounce: prevent rapid-fire touch events
  const lastTouchTimeRef = useRef(0);
  const TOUCH_COOLDOWN_MS = 500;

  /**
   * Detect which zone was touched based on the hit point's position
   * relative to the character's base (feet) Y coordinate.
   */
  const detectTouchZone = useCallback(
    (hitPoint: THREE.Vector3, characterBase: THREE.Vector3): TouchReaction => {
      const relativeY = hitPoint.y - characterBase.y;

      if (relativeY > HEAD_ZONE_THRESHOLD) {
        return REACTIONS.head;
      } else if (relativeY > BODY_ZONE_THRESHOLD) {
        return REACTIONS.body;
      }

      return REACTIONS.none;
    },
    [],
  );

  /**
   * Process a raycaster intersection on the character.
   * Determines the touch zone and returns the appropriate reaction.
   *
   * The intersection's object hierarchy is traversed to find the character
   * root (Group), whose position serves as the base Y reference.
   */
  const handleTouch = useCallback(
    (intersection: THREE.Intersection): TouchReaction => {
      const now = Date.now();
      if (now - lastTouchTimeRef.current < TOUCH_COOLDOWN_MS) {
        // Still in cooldown, return last reaction or none
        return lastReaction ?? REACTIONS.none;
      }
      lastTouchTimeRef.current = now;

      // Find the character root to use as base position.
      // Walk up the parent chain to find the top-level Group that is a direct
      // child of the scene (the VRM scene or fallback group).
      let characterBase = new THREE.Vector3(0, 0, 0);
      let current: THREE.Object3D | null = intersection.object;
      while (current) {
        if (
          current.parent &&
          current.parent.type === "Scene"
        ) {
          characterBase = current.position.clone();
          break;
        }
        current = current.parent;
      }

      const reaction = detectTouchZone(intersection.point, characterBase);
      setLastReaction(reaction);
      return reaction;
    },
    [detectTouchZone, lastReaction],
  );

  return {
    lastReaction,
    handleTouch,
    detectTouchZone,
  };
}
