import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import type { PetBehavior, PetAction } from "../lib/petBehavior.ts";

// ---------- Constants ----------

const PET_TICK_INTERVAL_MS = 1000;

// ---------- Types ----------

export interface UsePetTickOptions {
  characterRootRef: MutableRefObject<THREE.Object3D | null>;
  isDraggingRef: MutableRefObject<boolean>;
  petBehavior: PetBehavior;
  executePetActions: (actions: PetAction[]) => void;
}

// ---------- Hook ----------

/**
 * Runs a 1-second interval that ticks the PetBehavior state machine
 * and executes the resulting actions (move, animate, emote).
 *
 * Skips ticking while the character is being dragged.
 */
export function usePetTick({
  characterRootRef,
  isDraggingRef,
  petBehavior,
  executePetActions,
}: UsePetTickOptions): void {
  useEffect(() => {
    const tickId = setInterval(() => {
      const root = characterRootRef.current;
      if (!root) return;
      if (isDraggingRef.current) return;

      const currentPos = { x: root.position.x, y: root.position.y };
      const actions = petBehavior.tick(currentPos);
      executePetActions(actions);
    }, PET_TICK_INTERVAL_MS);

    return () => {
      clearInterval(tickId);
    };
  }, [characterRootRef, isDraggingRef, petBehavior, executePetActions]);
}
