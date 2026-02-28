import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import { emit } from "@tauri-apps/api/event";
import { log } from "../lib/logger.ts";
import type { TouchReaction } from "./useTouchReaction.ts";
import type { PetBehavior, PetAction } from "../lib/petBehavior.ts";
import type { EmotionState } from "./useEmotion.ts";
import type { PlayAnimationOptions } from "./useMotion.ts";

// ---------- Types ----------

export interface UseCharacterInteractionOptions {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  characterRootRef: MutableRefObject<THREE.Object3D | null>;
  isDraggingRef: MutableRefObject<boolean>;
  getHitTestTargets: () => THREE.Mesh[];
  onTouch: MutableRefObject<(intersection: THREE.Intersection) => TouchReaction>;
  onEmotion: MutableRefObject<(emotion: EmotionState) => void>;
  onMotion: MutableRefObject<(name: string, options?: PlayAnimationOptions) => void>;
  petBehavior: PetBehavior;
  executePetActions: (actions: PetAction[]) => void;
}

// ---------- Hook ----------

/**
 * Handles click and double-click events on the character:
 * - Single click: detects touch zone, triggers emotion + animation reaction
 * - Double click: emits `open-chat` event to open the chat window
 *
 * Uses raycasting to confirm the click lands on a character mesh.
 */
export function useCharacterInteraction({
  cameraRef,
  characterRootRef,
  isDraggingRef,
  getHitTestTargets,
  onTouch,
  onEmotion,
  onMotion,
  petBehavior,
  executePetActions,
}: UseCharacterInteractionOptions): void {
  useEffect(() => {
    function raycastClick(e: MouseEvent): THREE.Intersection | null {
      const camera = cameraRef.current;
      if (!camera) return null;
      if (!characterRootRef.current) return null;

      const ndc = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);

      const targets = getHitTestTargets();
      const intersections = raycaster.intersectObjects(targets, false);
      return intersections.length > 0 ? intersections[0] : null;
    }

    function handleClick(e: MouseEvent) {
      if (e.button !== 0) return;
      if (isDraggingRef.current) return;

      const hit = raycastClick(e);
      if (!hit) return;

      const reaction = onTouch.current(hit);
      if (reaction.zone === "none") return;

      // Notify pet behavior of touch interaction
      const petActions = petBehavior.handleInteraction("touch");
      executePetActions(petActions);

      // Apply touch-specific emotion and animation
      onEmotion.current(reaction.emotion as EmotionState);
      onMotion.current(reaction.animation, { loop: false });
    }

    function handleDoubleClick(e: MouseEvent) {
      const hit = raycastClick(e);
      if (!hit) return;

      petBehavior.handleInteraction("doubleClick");
      emit("open-chat").catch((err) => {
        log.warn("[CharacterInteraction] Failed to emit open-chat:", err);
      });
    }

    window.addEventListener("click", handleClick);
    window.addEventListener("dblclick", handleDoubleClick);

    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("dblclick", handleDoubleClick);
    };
  }, [
    cameraRef,
    characterRootRef,
    isDraggingRef,
    getHitTestTargets,
    onTouch,
    onEmotion,
    onMotion,
    petBehavior,
    executePetActions,
  ]);
}
