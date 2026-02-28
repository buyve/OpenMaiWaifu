import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";
import { AnimationManager } from "../lib/animationManager.ts";
import type { MotionPersonality } from "../lib/soulIdentity.ts";
import { log } from "../lib/logger.ts";

// ---------- Types ----------

export interface PlayAnimationOptions {
  /** Whether this animation loops. Default: true for base animations, false for actions. */
  loop?: boolean;
  /** Crossfade duration in seconds. Default: 0.3 */
  crossfadeDuration?: number;
}

export interface UseMotionReturn {
  /** Currently playing animation name, or null. */
  currentAnimation: string | null;
  /** Whether any animation is actively playing. */
  isPlaying: boolean;
  /** Play a named animation. Loads from file if not cached. */
  playAnimation: (name: string, options?: PlayAnimationOptions) => void;
  /** Stop all animations and return to idle. */
  stopAnimation: () => void;
  /** Must be called every frame with delta time (seconds). */
  update: (delta: number) => void;
}

// ---------- Hook ----------

/**
 * React hook that wraps AnimationManager for VRM motion playback.
 * VRMA-only: all animations loaded from external .vrma files.
 *
 * Features (via AnimationManager):
 * - 3-layer animation system: Base (looping), Action (one-shot), Additive
 * - Automatic crossfade between animations (300ms default)
 * - Action animations return to base layer on completion
 * - Animation caching to avoid reloading
 * - VRMA file loading via GLTFLoader + VRMAnimationLoaderPlugin
 */
export function useMotion(vrm: VRM | null, personality: MotionPersonality = "innocent"): UseMotionReturn {
  const [currentAnimation, setCurrentAnimation] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Refs for animation loop state (avoid re-renders)
  const managerRef = useRef<AnimationManager | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  // Initialize AnimationManager when VRM changes
  useEffect(() => {
    if (!vrm) {
      if (managerRef.current) {
        managerRef.current.dispose();
      }
      managerRef.current = null;
      mixerRef.current = null;
      setCurrentAnimation(null);
      setIsPlaying(false);
      return;
    }

    // Create a new mixer for this VRM
    const mixer = new THREE.AnimationMixer(vrm.scene);
    mixerRef.current = mixer;

    // Create the animation manager
    const manager = new AnimationManager(vrm, mixer);
    managerRef.current = manager;

    // Preload all VRMA motions from VRoid Hub (6 personalities + shared)
    const vrmaMotions = [
      // Shared / appearing
      "common-womanly-appearing", "common-manly-appearing",
      // Innocent
      "innocent-waiting", "innocent-liked", "innocent-happy",
      "innocent-laughing", "innocent-stretching",
      // Cool
      "cool-waiting", "cool-liked",
      // Shy
      "shy-waiting", "shy-liked",
      // Powerful
      "powerful-waiting", "powerful-liked",
      // Ladylike
      "ladylike-waiting", "ladylike-liked",
      // Standard
      "standard-waiting", "standard-liked",
      // Energetic
      "energetic-waiting", "energetic-liked",
      // Flamboyant
      "flamboyant-waiting", "flamboyant-liked",
      // Gentleman
      "gentleman-waiting", "gentleman-liked",
      // Photo Booth presets
      "photobooth-greeting", "photobooth-peace-sign", "photobooth-shoot",
      "photobooth-spin", "photobooth-model-pose", "photobooth-squat",
      "photobooth-show-full-body",
    ];
    manager.preloadAll(vrmaMotions).then(() => {
      log.info(`[useMotion] All ${vrmaMotions.length} VRMA motions preloaded`);

      // Register short aliases dynamically based on personality.
      // waiting/liked: use personality-specific VRMA.
      // happy/laughing/stretching: only innocent has these, so fallback to innocent-*.
      const aliases: [string, string][] = [
        ["appearing", "common-womanly-appearing"],
        ["manly-appearing", "common-manly-appearing"],
        ["waiting", `${personality}-waiting`],
        ["liked", `${personality}-liked`],
        ["happy", "innocent-happy"],
        ["laughing", "innocent-laughing"],
        ["stretching", "innocent-stretching"],
        ["wave", "common-womanly-appearing"],
        ["nod", `${personality}-liked`],
      ];
      for (const [alias, source] of aliases) {
        const cached = manager.getCachedClip(source);
        if (cached) {
          manager.registerClip(alias, cached.clip, cached.layer);
        }
      }

      // Register "idle" alias to personality-specific waiting VRMA
      const waitingClip = manager.getCachedClip(`${personality}-waiting`);
      if (waitingClip) {
        manager.registerClip("idle", waitingClip.clip, waitingClip.layer);
      }

      // Play "appearing" entrance, then crossfade to idle when done.
      manager.playAction("common-womanly-appearing", 0);
      // Detect when appearing finishes via a timer based on clip duration
      const appearingClip = manager.getCachedClip("common-womanly-appearing");
      const dur = appearingClip?.clip.duration ?? 3;
      setTimeout(() => {
        manager.playBase("idle", 0.5);
      }, (dur - 0.5) * 1000); // Start crossfade 0.5s before end
    });

    return () => {
      manager.dispose();
      managerRef.current = null;
      mixerRef.current = null;
    };
  }, [vrm, personality]);

  /**
   * Play a named animation. Loads from file if not yet cached.
   * Auto-detects layer based on animation name:
   * - Base layer: idle, waiting variants (looping)
   * - Action layer: liked, happy, stretching (one-shot)
   */
  const playAnimation = useCallback(
    (name: string, options?: PlayAnimationOptions) => {
      const manager = managerRef.current;
      if (!manager) return;

      manager.play(name, {
        loop: options?.loop,
        crossfadeDuration: options?.crossfadeDuration,
      });

      setCurrentAnimation(name);
      setIsPlaying(true);
    },
    [],
  );

  /**
   * Stop all animations.
   */
  const stopAnimation = useCallback(() => {
    const manager = managerRef.current;
    if (manager) {
      manager.stopAll();
    }
    setCurrentAnimation(null);
    setIsPlaying(false);
  }, []);

  /**
   * Frame update: advances the animation mixer and checks layer state.
   * Must be called every frame with delta in seconds.
   */
  const update = useCallback((delta: number) => {
    const manager = managerRef.current;
    if (!manager) return;

    manager.update(delta);

    // Sync React state with the manager's layer state
    const activeBase = manager.getActiveBase();
    const actionPlaying = manager.isActionPlaying();

    // Update current animation display: show action if playing, otherwise base
    setCurrentAnimation((prev) => {
      const next = actionPlaying ? prev : activeBase;
      return next !== prev ? next : prev;
    });

    setIsPlaying((prev) => {
      const next = activeBase !== null || actionPlaying;
      return next !== prev ? next : prev;
    });
  }, []);

  return {
    currentAnimation,
    isPlaying,
    playAnimation,
    stopAnimation,
    update,
  };
}
