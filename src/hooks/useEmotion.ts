import { useCallback, useEffect, useRef, useState } from "react";
import { VRM } from "@pixiv/three-vrm";
import type { ExpressionMap } from "./useVRM.ts";
import {
  EmotionStateMachine,
  type EmotionState,
} from "../lib/emotionStateMachine.ts";

// Re-export EmotionState for backward compatibility
export type { EmotionState };

// ---------- Types ----------

export interface UseEmotionReturn {
  /** Current emotion state. */
  currentEmotion: EmotionState;
  /** Set a new emotion (blends smoothly over ~300ms). */
  setEmotion: (emotion: EmotionState) => void;
  /** Trigger a manual blink. */
  triggerBlink: () => void;
  /** Must be called every frame with delta time (seconds). */
  update: (delta: number) => void;
}

// ---------- Hook ----------

/**
 * React hook that wraps EmotionStateMachine for VRM emotion management.
 *
 * Features (via EmotionStateMachine):
 * - Smooth 300ms smoothstep blending between emotion states
 * - Natural decay to neutral after configurable time
 * - Independent blink layer (random blinks every 3-7 seconds)
 * - Priority-based emotion override system
 * - Subtle breathing oscillation (~0.2Hz, 0.5% Y-scale)
 * - All expression weights clamped to [0, 1]
 */
export function useEmotion(
  vrm: VRM | null,
  expressionMap: ExpressionMap,
): UseEmotionReturn {
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>("neutral");

  // Persistent state machine instance across renders
  const stateMachineRef = useRef<EmotionStateMachine | null>(null);

  // Initialize or update the state machine when VRM changes
  useEffect(() => {
    if (vrm) {
      const sm = new EmotionStateMachine(vrm);
      sm.setExpressionMap(expressionMap);
      stateMachineRef.current = sm;
    } else {
      stateMachineRef.current = null;
    }

    setCurrentEmotion("neutral");

    return () => {
      stateMachineRef.current = null;
    };
  }, [vrm, expressionMap]);

  // Update expression map when it changes (without recreating the state machine)
  useEffect(() => {
    stateMachineRef.current?.setExpressionMap(expressionMap);
  }, [expressionMap]);

  /**
   * Sets a new target emotion and begins the smooth transition.
   * Higher priority emotions override lower ones.
   */
  const setEmotion = useCallback((emotion: EmotionState) => {
    const sm = stateMachineRef.current;
    if (!sm) return;

    sm.setState(emotion);
    setCurrentEmotion(sm.getState());
  }, []);

  /**
   * Manually trigger a blink.
   */
  const triggerBlink = useCallback(() => {
    stateMachineRef.current?.triggerBlink();
  }, []);

  /**
   * Frame update: handles blending, decay, blinking, and breathing.
   * Must be called every frame with delta in seconds.
   */
  const update = useCallback((delta: number) => {
    const sm = stateMachineRef.current;
    if (!sm) return;

    sm.update(delta);

    // Sync React state if the state machine's state changed (e.g., due to decay)
    const smState = sm.getState();
    setCurrentEmotion((prev) => (prev !== smState ? smState : prev));
  }, []);

  return {
    currentEmotion,
    setEmotion,
    triggerBlink,
    update,
  };
}
