import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";
import {
  CAMERA_FOV,
  CAMERA_BASE_DISTANCE,
  CAMERA_LOOKAT_Y,
} from "./constants.ts";

// ---------- Types ----------

export type PetState = "idle" | "reacting";

export interface WindowInfo {
  app_name: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  window_id: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface PetBehaviorState {
  state: PetState;
  targetPosition: Position | null;
  lastInteractionTime: number;
  stateStartTime: number;
}

/** Actions the behavior tick may request the renderer to perform. */
export interface PetAction {
  type:
    | "play_animation"
    | "set_emotion"
    | "set_position"
    | "none";
  position?: Position;
  animation?: string;
  emotion?: string;
}

// ---------- Constants ----------

/** Duration of reacting state in milliseconds. */
const REACTION_DURATION_MS = 2500;

// ---------- PetBehavior class ----------

/**
 * State machine that drives the desktop pet's autonomous behavior.
 * VRMA-only: idle + reacting states. All animations come from external .vrma files.
 *
 * Usage:
 *   const pet = new PetBehavior();
 *   // Every 1 second:
 *   const actions = pet.tick(currentCharacterPosition);
 *   // On user interaction:
 *   const actions = pet.handleInteraction('touch');
 */
export class PetBehavior {
  private _state: PetBehaviorState;
  private _windows: WindowInfo[] = [];
  private _screenSize: ScreenSize = { width: 1920, height: 1080 };

  /** Current camera Z distance — updated externally when zoom changes. */
  private _cameraZ = CAMERA_BASE_DISTANCE;
  /** Current camera aspect ratio — updated externally on resize. */
  private _cameraAspect = 16 / 9;

  constructor() {
    const now = Date.now();
    this._state = {
      state: "idle",
      targetPosition: null,
      lastInteractionTime: now,
      stateStartTime: now,
    };

    // Initial screen fetch
    this.fetchScreenSize();
  }

  /** Current behavior state (read-only snapshot). */
  get state(): Readonly<PetBehaviorState> {
    return this._state;
  }

  /** Cached window list from the last poll. */
  get windows(): ReadonlyArray<WindowInfo> {
    return this._windows;
  }

  /** Current screen size. */
  get screenSize(): Readonly<ScreenSize> {
    return this._screenSize;
  }

  // ---------- Screen size ----------

  /** Fetches screen size once (or on demand). */
  async fetchScreenSize(): Promise<void> {
    try {
      this._screenSize = await invoke<ScreenSize>("get_screen_size");
    } catch (err) {
      log.warn("[PetBehavior] Failed to get screen size:", err);
    }
  }

  /**
   * Update camera state from the renderer. Call this whenever the camera
   * changes (zoom, resize) so screenToWorld stays accurate.
   */
  updateCamera(cameraZ: number, aspect: number): void {
    this._cameraZ = cameraZ;
    this._cameraAspect = aspect;
  }

  // ---------- Main tick ----------

  /**
   * Called every 1 second. Evaluates current state and returns actions
   * for the renderer to execute.
   *
   * @param currentPos - Current character world-space position.
   * @returns Array of actions to perform.
   */
  tick(_currentPos: Position): PetAction[] {
    const actions: PetAction[] = [];
    const now = Date.now();

    switch (this._state.state) {
      case "idle":
        return this.tickIdle(actions);

      case "reacting":
        return this.tickReacting(now, actions);
    }
  }

  // ---------- State tick handlers ----------

  /** Idle: just keep the current waiting animation looping. No random switches. */
  private tickIdle(actions: PetAction[]): PetAction[] {
    return actions;
  }

  private tickReacting(now: number, actions: PetAction[]): PetAction[] {
    const elapsed = now - this._state.stateStartTime;
    if (elapsed >= REACTION_DURATION_MS) {
      // Reaction finished — always return to idle
      this.transitionTo("idle");
      actions.push({ type: "play_animation", animation: "idle" });
      actions.push({ type: "set_emotion", emotion: "neutral" });
    }
    return actions;
  }

  // ---------- Interaction handling ----------

  /**
   * Process a user interaction with the character.
   *
   * @returns Actions to perform in response.
   */
  handleInteraction(
    interactionType: "touch" | "drag" | "doubleClick",
  ): PetAction[] {
    const actions: PetAction[] = [];
    this._state.lastInteractionTime = Date.now();

    switch (interactionType) {
      case "touch":
        // Transition to reacting state (touch reactions are handled by useTouchReaction)
        this.transitionTo("reacting");
        break;

      case "drag":
        // Drag ALWAYS resets to idle.
        this._state.targetPosition = null;
        if (this._state.state !== "idle") {
          this.transitionTo("idle");
        }
        // Reset stateStartTime even if already idle, so any subsequent
        // "falling" state after drag release gets a fresh timestamp.
        this._state.stateStartTime = Date.now();
        actions.push({ type: "play_animation", animation: "idle" });
        break;

      case "doubleClick":
        // Double-click opens chat (handled by VRMViewer via event emission)
        break;
    }

    return actions;
  }

  // ---------- Helpers ----------

  /**
   * Convert screen pixels to Three.js world-space coordinates.
   *
   * Dynamically calculates the visible frustum based on the current camera
   * state (FOV, distance, aspect ratio) so that zoom and window resize
   * don't break the coordinate mapping.
   */
  screenToWorld(screenX: number, screenY: number): Position {
    const sw = this._screenSize.width;
    const sh = this._screenSize.height;

    // Normalize to [-1, 1]
    const ndcX = (screenX / sw) * 2 - 1;
    const ndcY = -((screenY / sh) * 2 - 1); // Flip Y

    // Dynamically compute frustum at z=0 plane based on current camera state
    const halfAngle = (CAMERA_FOV / 2) * (Math.PI / 180);
    const halfHeight = Math.tan(halfAngle) * this._cameraZ;
    const halfWidth = halfHeight * this._cameraAspect;

    const worldX = ndcX * halfWidth;
    // Camera lookAt.y = 1.0, so offset by that
    const worldY = CAMERA_LOOKAT_Y + ndcY * halfHeight;

    return { x: worldX, y: worldY };
  }

  private transitionTo(newState: PetState): void {
    this._state.state = newState;
    this._state.stateStartTime = Date.now();

    if (newState === "idle") {
      this._state.targetPosition = null;
    }
  }

  /** Force-reset to idle. Useful when the character is loaded for the first time. */
  reset(): void {
    const now = Date.now();
    this._state = {
      state: "idle",
      targetPosition: null,
      lastInteractionTime: now,
      stateStartTime: now,
    };
  }
}
