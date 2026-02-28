/**
 * Centralized constants for the AI Desktop Companion.
 *
 * Constants that are only used in a single file and are already well-named
 * remain in their source files. This module collects values that are:
 *  - duplicated across files (e.g. camera FOV)
 *  - commonly-tuned magic numbers (timing, UI dimensions)
 *  - shared between frontend modules
 */

// ============================================================
// Camera & Scene
// ============================================================

/** Perspective camera field-of-view in degrees. */
export const CAMERA_FOV = 30;

/** Default camera Z distance (at 1080px reference height). */
export const CAMERA_BASE_DISTANCE = 6.0;

/** Camera lookAt target Y position (world-units). */
export const CAMERA_LOOKAT_Y = 1.0;

/** Reference window height for auto-scaling camera distance. */
export const CAMERA_REFERENCE_HEIGHT = 1080;

/** Near clipping plane. */
export const CAMERA_NEAR = 0.1;

/** Far clipping plane. */
export const CAMERA_FAR = 20;

/** Maximum pixel ratio sent to the renderer. */
export const RENDERER_MAX_PIXEL_RATIO = 2;

// ---- Zoom ----

/** Minimum camera Z distance (closest zoom). */
export const ZOOM_MIN = 1.5;

/** Maximum camera Z distance (farthest zoom). */
export const ZOOM_MAX = 6.0;

/** World-units the camera moves per scroll event. */
export const ZOOM_SPEED = 0.3;

// ---- FPS throttling ----

/** Target FPS when the window is focused and visible. */
export const FPS_ACTIVE = 60;

/** Target FPS when the window loses focus but is still visible.
 * Matches FPS_ACTIVE because this is an always-on-top overlay that
 * remains visible even when the user is working in other apps. */
export const FPS_BLURRED = 60;

/** Target FPS when the tab / window is hidden. */
export const FPS_HIDDEN = 5;

// ============================================================
// Frustum Clamping (VRMViewer)
// ============================================================

/** Normal mode — horizontal margin from frustum edge. */
export const CLAMP_MARGIN_X = 0.35;

/** Normal mode — top margin from frustum edge (accounts for character height). */
export const CLAMP_MARGIN_TOP = 1.6;

/** Normal mode — bottom margin from frustum edge. */
export const CLAMP_MARGIN_BOTTOM = 0.05;

// ============================================================
// Facing / Rotation
// ============================================================

/** Rotation lerp speed factor when turning to face movement direction. */
export const FACING_ROTATION_LERP = 5;

// ============================================================
// Head Projection
// ============================================================

/** Vertical offset above the head bone for speech bubble anchor (world-units). */
export const HEAD_PROJECTION_OFFSET_Y = 0.15;

/** Fallback head height estimate from root position (world-units). */
export const HEAD_FALLBACK_HEIGHT = 1.05;

// ============================================================
// UI — Speech Bubble
// ============================================================

/**
 * Base duration the speech bubble stays fully visible (ms).
 * Actual duration scales with text length: base + 80ms per character.
 */
export const SPEECH_BUBBLE_DISPLAY_MS = 4000;

/** Extra display time per character (ms). */
export const SPEECH_BUBBLE_MS_PER_CHAR = 80;

/** Duration of the speech bubble fade-out animation (ms). */
export const SPEECH_BUBBLE_FADE_MS = 300;

// ============================================================
// UI — FTUE Chat Bubble
// ============================================================

/** Width of the FTUE chat bubble (px). */
export const FTUE_BUBBLE_WIDTH = 300;

/** Screen edge margin for the FTUE chat bubble (px). */
export const FTUE_SCREEN_MARGIN = 12;

// ============================================================
// Timing — App.tsx Delays
// ============================================================

/** Delay before auto-opening the FTUE chat (ms). */
export const FTUE_AUTO_OPEN_DELAY_MS = 3000;

/** Delay before showing the FTUE wave animation (ms). */
export const FTUE_WAVE_DELAY_MS = 500;

/** Delay before showing a recall moment speech bubble (ms). */
export const RECALL_MOMENT_DELAY_MS = 1500;

/** Delay for the "surprised -> happy" emotion transition after recall (ms). */
export const RECALL_HAPPY_TRANSITION_MS = 2000;

/** Interval for the comment engine evaluation cycle (ms). */
export const COMMENT_EVAL_INTERVAL_MS = 30_000;

/** Interval for memory worker tasks (ms) — promotion + expiration. */
export const MEMORY_WORKER_INTERVAL_MS = 60 * 60 * 1000;

/** Quiet-mode mute duration (ms). */
export const QUIET_MODE_DURATION_MS = 30 * 60 * 1000;

// ============================================================
// Timing — Focus / Input
// ============================================================

/** Delay before focusing an input element after it appears (ms). */
export const INPUT_FOCUS_DELAY_MS = 100;

// ============================================================
// Hit Test
// ============================================================

/** Frame interval for periodic hit-test debug logging (~2 seconds at 60 FPS). */
export const HIT_TEST_DEBUG_INTERVAL = 120;

// ============================================================
// Lighting
// ============================================================

/** Ambient light intensity. */
export const AMBIENT_LIGHT_INTENSITY = 0.6;

/** Directional light intensity. */
export const DIRECTIONAL_LIGHT_INTENSITY = Math.PI;

// ============================================================
// 2D Platform Physics
// ============================================================

/** Gravity acceleration in world-units/s² (negative = downward). */
export const PHYSICS_GRAVITY = -2.5;

/** Maximum falling speed in world-units/s. */
export const PHYSICS_TERMINAL_VELOCITY = -3.0;

/** Ground friction deceleration factor per second (higher = faster stop). */
export const PHYSICS_GROUND_FRICTION = 8.0;

/** Air friction factor per second. */
export const PHYSICS_AIR_FRICTION = 1.0;

/** Platform collision thickness in world-units. */
export const PHYSICS_PLATFORM_THICKNESS = 0.02;

/** Collision skin to prevent tunneling (world-units). */
export const PHYSICS_COLLISION_SKIN = 0.005;

/** Distance from platform edge to trigger edge state (world-units). */
export const PHYSICS_EDGE_SNAP_DISTANCE = 0.05;

/** Character collision box width (world-units). */
export const PHYSICS_CHAR_WIDTH = 0.25;

/** Character collision box height (world-units). */
export const PHYSICS_CHAR_HEIGHT = 0.15;

/** Enable/disable the 2D physics system. */
export const PHYSICS_ENABLED = true;

// ============================================================
// LLM Service
// ============================================================

/** Maximum memories to send to the LLM for distillation. */
export const LLM_DISTILL_MAX_MEMORIES = 10;

/** Maximum memories to send to the LLM for imagination generation. */
export const LLM_IMAGINATION_MAX_MEMORIES = 5;

/** Maximum M0 memories to send to the LLM for belief extraction. */
export const LLM_BELIEF_MAX_M0 = 20;

/** Minimum M0 memory count before attempting belief extraction. */
export const LLM_BELIEF_MIN_M0_COUNT = 2;

// ============================================================
// Topic Clustering (Memory Promotion)
// ============================================================

/** Minimum cluster size for topic-based promotion. */
export const TOPIC_CLUSTER_MIN_SIZE = 3;

/** Minimum keyword overlap to consider memories in the same cluster. */
export const TOPIC_CLUSTER_MIN_OVERLAP = 2;

// ============================================================
// Memory Promotion — Flashbulb & Temporal Spread
// ============================================================

/** Flashbulb: intensity threshold to halve age requirement for promotion. */
export const FLASHBULB_MILD_THRESHOLD = 0.85;

/** Flashbulb: intensity threshold to waive age requirement entirely. */
export const FLASHBULB_EXTREME_THRESHOLD = 0.95;

/** Temporal spread minimum (days) for M30→M90 promotion. */
export const SPREAD_M30_TO_M90_DAYS = 3;

/** Temporal spread minimum (days) for M90→M365 promotion. */
export const SPREAD_M90_TO_M365_DAYS = 14;

// ============================================================
// Memory Promotion — Auto M0
// ============================================================

/** Minimum age (days) for M365→M0 automatic promotion. */
export const M0_AUTO_PROMOTE_MIN_AGE_DAYS = 180;

/** Minimum reference count for M365→M0 automatic promotion. */
export const M0_AUTO_PROMOTE_MIN_REFS = 10;

/** Maximum M0 promotions per single pipeline run (safety cap). */
export const M0_AUTO_PROMOTE_MAX_PER_RUN = 1;

// ============================================================
// localStorage Key Migration
// ============================================================

/**
 * Old → New key mapping. All keys now use the `companion_` prefix
 * with underscores for consistency.
 */
const STORAGE_KEY_MIGRATIONS: [string, string][] = [
  ["settings_behavior", "companion_settings_behavior"],
  ["settings_model_name", "companion_settings_model_name"],
  ["vrm-model-path", "companion_vrm_model_path"],
  ["ai-companion-character-position", "companion_character_position"],
  ["ftue_complete", "companion_ftue_complete"],
  ["user_name", "companion_user_name"],
  ["first_recall_triggered", "companion_first_recall_triggered"],
  ["soul_identity", "companion_soul_identity"],
  ["privacy_settings", "companion_privacy_settings"],
  ["comment_history", "companion_comment_history"],
];

/**
 * One-time migration of old localStorage keys to the standardized
 * `companion_` prefix. Safe to call multiple times — skips keys
 * that have already been migrated.
 */
export function migrateStorageKeys(): void {
  try {
    for (const [oldKey, newKey] of STORAGE_KEY_MIGRATIONS) {
      const oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
        localStorage.removeItem(oldKey);
      }
    }
  } catch {
    // localStorage unavailable
  }
}
