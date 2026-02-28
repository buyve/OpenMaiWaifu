import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM } from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  VRMAnimation,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";
import { log } from "./logger.ts";

// ---------- Types ----------

export enum AnimationLayer {
  /** Looping fundamentals: idle + waiting variants. */
  Base = 0,
  /** One-shot reactions: liked, happy, stretching, etc. Returns to base when done. */
  Action = 1,
  /** Additive micro-movements: always active with configurable weight. */
  Additive = 2,
}

export interface AnimationConfig {
  name: string;
  layer: AnimationLayer;
  loop: boolean;
  crossfadeDuration: number;
  weight: number;
}

interface CachedClip {
  clip: THREE.AnimationClip;
  layer: AnimationLayer;
}

// ---------- Constants ----------

/** Animations that belong to the base layer and loop (VRMA-only). */
const BASE_ANIMATIONS = new Set([
  "idle",
  // VRMA waiting/idle variants (all personality types)
  "waiting", "cool-waiting", "shy-waiting", "powerful-waiting",
  "ladylike-waiting", "standard-waiting",
  "energetic-waiting", "flamboyant-waiting", "gentleman-waiting",
]);

/** Animations that belong to the action layer — one-shot (VRMA-only). */
const ACTION_ANIMATIONS = new Set([
  // VRMA one-shot animations
  "appearing", "manly-appearing",
  "happy", "laughing", "stretching",
  "liked", "cool-liked", "shy-liked", "powerful-liked",
  "ladylike-liked", "standard-liked",
  "energetic-liked", "flamboyant-liked", "gentleman-liked",
  // Photo Booth one-shots
  "photobooth-greeting", "photobooth-peace-sign", "photobooth-shoot",
  "photobooth-spin", "photobooth-model-pose", "photobooth-squat",
  "photobooth-show-full-body",
]);

/** Default crossfade duration in seconds. */
const DEFAULT_CROSSFADE = 0.3;

/** Base path for animation files (.vrma). */
const ANIMATIONS_PATH = "/motions";

// ---------- AnimationManager ----------

/**
 * VRMA-only animation system for VRM characters.
 *
 * Layer 0 (Base):     Looping fundamentals — idle + waiting variants.
 *                     One animation at a time, crossfade between them.
 *
 * Layer 1 (Action):   One-shot reactions — liked, happy, stretching, etc.
 *                     Plays on top of base. Auto-returns to base on completion.
 *
 * Layer 2 (Additive): Small oscillating animations blended on top of everything.
 *                     Always active with configurable weight.
 */
export class AnimationManager {
  private _vrm: VRM | null;
  private _mixer: THREE.AnimationMixer | null;
  private _loader: GLTFLoader | null = null;

  // Animation clip cache (avoids reloading)
  private _cache: Map<string, CachedClip> = new Map();
  private _loading: Set<string> = new Set();

  // Layer state
  private _baseAction: THREE.AnimationAction | null = null;
  private _baseName: string | null = null;

  private _actionAction: THREE.AnimationAction | null = null;
  private _actionName: string | null = null;
  private _actionPlaying = false;

  private _additiveWeight = 1.0;

  // Callback when action completes (return to base)
  private _onActionFinished: ((event: {
    action: THREE.AnimationAction;
  }) => void) | null = null;

  constructor(vrm: VRM | null, mixer: THREE.AnimationMixer | null) {
    this._vrm = vrm;
    this._mixer = mixer;

    if (vrm && mixer) {
      this._initLoader();
      this._setupFinishedListener();
    }
  }

  // ---------- Public API ----------

  /** Update the VRM reference (e.g., on model reload). */
  setVRM(vrm: VRM | null): void {
    this._vrm = vrm;
  }

  /** Update the mixer reference. */
  setMixer(mixer: THREE.AnimationMixer | null): void {
    // Remove old listener
    if (this._mixer && this._onActionFinished) {
      this._mixer.removeEventListener("finished", this._onActionFinished);
    }

    this._mixer = mixer;
    this._cache = new Map();
    this._loading = new Set();
    this._baseAction = null;
    this._baseName = null;
    this._actionAction = null;
    this._actionName = null;
    this._actionPlaying = false;

    if (mixer) {
      this._initLoader();
      this._setupFinishedListener();
    }
  }

  /**
   * Play a base-layer animation (idle, waiting variants).
   * Crossfades from the current base animation.
   */
  playBase(name: string, crossfadeDuration?: number): void {
    if (this._baseName === name && this._baseAction) return;

    const crossfade = crossfadeDuration ?? DEFAULT_CROSSFADE;

    const cached = this._cache.get(name);
    if (cached) {
      this._applyBase(name, cached, crossfade);
      return;
    }

    // Load and then play
    this._loadAnimation(name).then((entry) => {
      if (entry) {
        this._applyBase(name, entry, crossfade);
      }
    });
  }

  /**
   * Play an action-layer animation (liked, happy, stretching, etc.).
   * Plays on top of the current base. When complete, crossfades back to base.
   */
  playAction(name: string, crossfadeDuration?: number): void {
    const crossfade = crossfadeDuration ?? DEFAULT_CROSSFADE;

    const cached = this._cache.get(name);
    if (cached) {
      this._applyAction(name, cached, crossfade);
      return;
    }

    this._loadAnimation(name).then((entry) => {
      if (entry) {
        this._applyAction(name, entry, crossfade);
      }
    });
  }

  /** Set the additive layer weight (0-1). */
  setAdditiveWeight(weight: number): void {
    this._additiveWeight = Math.max(0, Math.min(1, weight));
  }

  /** Get the currently active base animation name. */
  getActiveBase(): string | null {
    return this._baseName;
  }

  /** Get the currently active action animation name. */
  getActiveAction(): string | null {
    return this._actionName;
  }

  /** Whether an action-layer animation is currently playing. */
  isActionPlaying(): boolean {
    return this._actionPlaying;
  }

  /** Get the current additive layer weight. */
  getAdditiveWeight(): number {
    return this._additiveWeight;
  }

  /**
   * Play an animation by name, auto-detecting its layer.
   * This is the main entry point for external code that doesn't know/care about layers.
   *
   * @param name Animation name (e.g., "idle", "liked", "happy")
   * @param options Optional play options
   */
  play(
    name: string,
    options?: { loop?: boolean; crossfadeDuration?: number },
  ): void {
    const crossfade = options?.crossfadeDuration ?? DEFAULT_CROSSFADE;
    const isLoop = options?.loop ?? BASE_ANIMATIONS.has(name);

    if (isLoop || BASE_ANIMATIONS.has(name)) {
      this.playBase(name, crossfade);
    } else if (ACTION_ANIMATIONS.has(name) || !isLoop) {
      this.playAction(name, crossfade);
    }
  }

  /** Stop all animations on all layers. */
  stopAll(): void {
    if (this._mixer) {
      this._mixer.stopAllAction();
    }
    this._baseAction = null;
    this._baseName = null;
    this._actionAction = null;
    this._actionName = null;
    this._actionPlaying = false;
  }

  /**
   * Register a pre-built AnimationClip directly into the cache.
   * Bypasses file loading entirely — registered clips take priority
   * since _loadAnimation() checks cache first.
   */
  registerClip(name: string, clip: THREE.AnimationClip, layer: AnimationLayer): void {
    this._cache.set(name, { clip, layer });
  }

  /** Get a cached clip entry by name (or null if not loaded). */
  getCachedClip(name: string): CachedClip | null {
    return this._cache.get(name) ?? null;
  }

  /**
   * Preload multiple animations into cache without playing them.
   * Returns once all have loaded (or failed).
   */
  async preloadAll(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this._loadAnimation(name)));
  }

  /** Frame update. Advances the animation mixer. Must be called every frame. */
  update(delta: number): void {
    this._mixer?.update(delta);
  }

  /** Clean up resources. */
  dispose(): void {
    if (this._mixer) {
      if (this._onActionFinished) {
        this._mixer.removeEventListener("finished", this._onActionFinished);
      }
      this._mixer.stopAllAction();
    }

    this._cache.clear();
    this._loading.clear();
    this._baseAction = null;
    this._baseName = null;
    this._actionAction = null;
    this._actionName = null;
    this._actionPlaying = false;
    this._mixer = null;
    this._vrm = null;
    this._loader = null;
  }

  // ---------- Private Methods ----------

  private _initLoader(): void {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    this._loader = loader;
  }

  private _setupFinishedListener(): void {
    if (!this._mixer) return;

    this._onActionFinished = (event: {
      action: THREE.AnimationAction;
    }) => {
      const action = event.action;

      // Only handle action-layer animations (oneshot / LoopOnce)
      if (action.loop !== THREE.LoopOnce) return;

      action.stop();
      this._actionAction = null;
      this._actionName = null;
      this._actionPlaying = false;

      // Return to current base animation with crossfade
      if (this._baseName && this._baseAction) {
        // Base should already be playing underneath; just ensure weight is full
        this._baseAction.setEffectiveWeight(1.0);
      }
    };

    this._mixer.addEventListener("finished", this._onActionFinished);
  }

  private _loadAnimation(name: string): Promise<CachedClip | null> {
    // Already cached
    const cached = this._cache.get(name);
    if (cached) return Promise.resolve(cached);

    // Already loading — wait for it with a timeout to prevent infinite polling
    if (this._loading.has(name)) {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const check = setInterval(() => {
          if (Date.now() - startTime > 10000) {
            clearInterval(check);
            this._loading.delete(name);
            resolve(null);
            return;
          }
          const entry = this._cache.get(name);
          if (entry || !this._loading.has(name)) {
            clearInterval(check);
            resolve(entry ?? null);
          }
        }, 50);
      });
    }

    const loader = this._loader;
    const vrm = this._vrm;
    if (!loader || !vrm) return Promise.resolve(null);

    this._loading.add(name);

    return new Promise((resolve) => {
      const url = `${ANIMATIONS_PATH}/${name}.vrma`;

      loader.load(
        url,
        (gltf) => {
          const vrmAnimation = gltf.userData.vrmAnimations?.[0] as
            | VRMAnimation
            | undefined;

          if (!vrmAnimation || !this._vrm) {
            log.warn(
              `[AnimationManager] No VRM animation data found in ${url}`,
            );
            this._loading.delete(name);
            resolve(null);
            return;
          }

          const clip = createVRMAnimationClip(vrmAnimation, this._vrm);
          const layer = this._detectLayer(name);
          const entry: CachedClip = { clip, layer };

          this._cache.set(name, entry);
          this._loading.delete(name);

          log.info(
            `[AnimationManager] Loaded: ${name} (layer=${AnimationLayer[layer]}, ${clip.duration.toFixed(2)}s)`,
          );
          resolve(entry);
        },
        undefined,
        (err) => {
          log.warn(`[AnimationManager] Failed to load ${url}:`, err);
          this._loading.delete(name);
          resolve(null);
        },
      );
    });
  }

  private _detectLayer(name: string): AnimationLayer {
    if (BASE_ANIMATIONS.has(name)) return AnimationLayer.Base;
    if (ACTION_ANIMATIONS.has(name)) return AnimationLayer.Action;
    return AnimationLayer.Action; // Default unknown animations to action layer
  }

  private _applyBase(
    name: string,
    entry: CachedClip,
    crossfadeDuration: number,
  ): void {
    const mixer = this._mixer;
    if (!mixer) return;

    const newAction = mixer.clipAction(entry.clip);
    newAction.reset();
    newAction.setLoop(THREE.LoopRepeat, Infinity);
    newAction.setEffectiveWeight(1.0);

    // Crossfade from previous base action
    const prevBase = this._baseAction;
    if (prevBase && crossfadeDuration > 0) {
      newAction.play();
      prevBase.crossFadeTo(newAction, crossfadeDuration, true);
    } else {
      if (prevBase) prevBase.stop();
      newAction.play();
    }

    this._baseAction = newAction;
    this._baseName = name;
  }

  private _applyAction(
    name: string,
    entry: CachedClip,
    crossfadeDuration: number,
  ): void {
    const mixer = this._mixer;
    if (!mixer) return;

    // Stop previous action if any
    if (this._actionAction) {
      this._actionAction.stop();
    }

    const newAction = mixer.clipAction(entry.clip);
    newAction.reset();
    newAction.setLoop(THREE.LoopOnce, 1);
    newAction.clampWhenFinished = true;
    newAction.setEffectiveWeight(1.0);

    // Crossfade from base (base keeps playing underneath at reduced weight)
    if (this._baseAction && crossfadeDuration > 0) {
      newAction.play();
      // Don't crossFadeTo — instead, let action layer play on top
      // The base remains active underneath
    } else {
      newAction.play();
    }

    this._actionAction = newAction;
    this._actionName = name;
    this._actionPlaying = true;
  }
}
