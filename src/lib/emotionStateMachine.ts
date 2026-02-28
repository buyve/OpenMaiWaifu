import { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";

// ---------- Types ----------

export type EmotionState =
  | "neutral"
  | "happy"
  | "sad"
  | "angry"
  | "surprised"
  | "relaxed"
  | "thinking"
  | "sleepy"
  | "distressed";

export interface EmotionConfig {
  /** BlendShape preset name -> target weight. */
  expressions: Record<string, number>;
  /** Seconds until natural decay to neutral. Infinity = never decays. */
  decayTime: number;
  /** Higher priority overrides lower. Same priority -> new emotion wins. */
  priority: number;
}

// ---------- Emotion Configurations ----------

export const EMOTION_CONFIGS: Record<EmotionState, EmotionConfig> = {
  neutral: { expressions: {}, decayTime: Infinity, priority: 0 },
  happy: {
    expressions: { [VRMExpressionPresetName.Happy]: 1.0 },
    decayTime: 10,
    priority: 1,
  },
  sad: {
    expressions: { [VRMExpressionPresetName.Sad]: 0.8 },
    decayTime: 15,
    priority: 1,
  },
  angry: {
    expressions: { [VRMExpressionPresetName.Angry]: 0.9 },
    decayTime: 8,
    priority: 2,
  },
  surprised: {
    expressions: { [VRMExpressionPresetName.Surprised]: 1.0 },
    decayTime: 5,
    priority: 3,
  },
  relaxed: {
    expressions: { [VRMExpressionPresetName.Relaxed]: 0.7 },
    decayTime: 20,
    priority: 1,
  },
  thinking: {
    expressions: {
      [VRMExpressionPresetName.Neutral]: 0.3,
      [VRMExpressionPresetName.Surprised]: 0.2,
    },
    decayTime: 12,
    priority: 1,
  },
  sleepy: {
    expressions: {
      [VRMExpressionPresetName.Relaxed]: 0.5,
      [VRMExpressionPresetName.Blink]: 0.3,
    },
    decayTime: Infinity,
    priority: 0,
  },
  distressed: {
    expressions: {
      [VRMExpressionPresetName.Angry]: 0.3,
      [VRMExpressionPresetName.Sad]: 0.4,
      [VRMExpressionPresetName.Blink]: 0.6,
    },
    decayTime: 2,
    priority: 4,
  },
};

/** All VRM expression preset names we may manipulate (for resetting). */
const ALL_EXPRESSION_PRESETS: string[] = [
  VRMExpressionPresetName.Happy,
  VRMExpressionPresetName.Angry,
  VRMExpressionPresetName.Sad,
  VRMExpressionPresetName.Relaxed,
  VRMExpressionPresetName.Surprised,
  VRMExpressionPresetName.Neutral,
];

/** Mouth expression presets for idle micro-expressions. */
const MOUTH_EXPRESSIONS: string[] = [
  VRMExpressionPresetName.Aa,
  VRMExpressionPresetName.Ih,
  VRMExpressionPresetName.Ou,
  VRMExpressionPresetName.Ee,
  VRMExpressionPresetName.Oh,
];

/** Emotions during which idle mouth micro-expressions are suppressed. */
const MOUTH_SUPPRESS_EMOTIONS: Set<EmotionState> = new Set([
  "angry", "surprised", "distressed",
]);

/** Eye dart expression presets (LookLeft / LookRight). */
const EYE_DART_EXPRESSIONS: string[] = [
  VRMExpressionPresetName.LookLeft,
  VRMExpressionPresetName.LookRight,
];

/** Min seconds between eye darts. */
const EYE_DART_MIN_INTERVAL = 8.0;

/** Max seconds between eye darts. */
const EYE_DART_MAX_INTERVAL = 23.0;

/** Duration of an eye dart in seconds. */
const EYE_DART_DURATION = 0.2;

/** Peak weight for eye dart expression. */
const EYE_DART_WEIGHT = 0.3;

function randomEyeDartInterval(): number {
  return EYE_DART_MIN_INTERVAL + Math.random() * (EYE_DART_MAX_INTERVAL - EYE_DART_MIN_INTERVAL);
}

// ---------- Constants ----------

/** Transition duration in seconds for blending between emotions. */
const TRANSITION_DURATION = 0.3;

/** Blink duration in seconds (150ms triangle wave). */
const BLINK_DURATION = 0.15;

/** Minimum seconds between random blinks. */
const BLINK_MIN_INTERVAL = 3.0;

/** Maximum seconds between random blinks. */
const BLINK_MAX_INTERVAL = 7.0;

/** Breathing frequency in Hz. */
const BREATHING_FREQUENCY = 0.2;

/** Breathing amplitude as a fraction of scale (0.5% = 0.005). */
const BREATHING_AMPLITUDE = 0.005;

// ---------- Utility Functions ----------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function randomBlinkInterval(): number {
  return (
    BLINK_MIN_INTERVAL +
    Math.random() * (BLINK_MAX_INTERVAL - BLINK_MIN_INTERVAL)
  );
}

/** Minimum seconds between idle mouth micro-expressions. */
const MOUTH_MIN_INTERVAL = 5.0;

/** Maximum seconds between idle mouth micro-expressions. */
const MOUTH_MAX_INTERVAL = 15.0;

/** Peak weight for idle mouth micro-expressions (very subtle). */
const MOUTH_PEAK_WEIGHT = 0.15;

function randomMouthInterval(): number {
  return MOUTH_MIN_INTERVAL + Math.random() * (MOUTH_MAX_INTERVAL - MOUTH_MIN_INTERVAL);
}

// ---------- EmotionStateMachine ----------

/**
 * Full emotion state machine that manages:
 * - Smooth blending transitions (300ms smoothstep)
 * - Natural decay to neutral after configurable time
 * - Independent blink layer (random blinks every 3-7s)
 * - Priority-based emotion override
 * - Subtle breathing oscillation
 *
 * Expression weights are always clamped to [0, 1].
 */
export class EmotionStateMachine {
  // VRM reference
  private _vrm: VRM | null;

  // Expression name resolution map (preset -> actual expression name on model)
  private _expressionMap: Record<string, string> = {};

  // Current emotion state
  private _currentState: EmotionState = "neutral";
  // Blend transition state
  private _fromWeights: Map<string, number> = new Map();
  private _toWeights: Map<string, number> = new Map();
  private _transitionProgress = 1.0; // 1.0 = complete, < 1.0 = blending
  private _activeWeights: Map<string, number> = new Map();

  // Decay tracking
  private _elapsedSinceStateChange = 0;

  // Blink state (independent layer)
  private _blinkEnabled = true;
  private _blinkTimer: number;
  private _isBlinking = false;
  private _blinkProgress = 0;

  // Breathing state (independent layer)
  private _breathingEnabled = true;
  private _breathPhase = 0;

  // Idle mouth micro-expression state
  private _mouthTimer = 0;
  private _mouthNextInterval = 0;
  private _mouthActive = false;
  private _mouthProgress = 0;
  private _mouthExpression = "";
  private _mouthDuration = 0.4; // triangle wave duration

  // Eye dart state
  private _eyeDartTimer = 0;
  private _eyeDartNextInterval = 0;
  private _eyeDartActive = false;
  private _eyeDartProgress = 0;
  private _eyeDartExpression = "";

  // Total elapsed time
  private _totalElapsed = 0;

  constructor(vrm: VRM | null) {
    this._vrm = vrm;
    this._blinkTimer = randomBlinkInterval();
    this._mouthNextInterval = randomMouthInterval();
    this._eyeDartNextInterval = randomEyeDartInterval();
  }

  // ---------- Public API ----------

  /** Set the expression name resolution map (from useVRM's expressionMap). */
  setExpressionMap(map: Record<string, string>): void {
    this._expressionMap = map;
  }

  /** Update the VRM reference (e.g., when model reloads). */
  setVRM(vrm: VRM | null): void {
    this._vrm = vrm;
    if (vrm) {
      this.reset();
    }
  }

  /**
   * Transition to a new emotion state.
   * - Higher priority emotions override lower ones.
   * - Same priority: new emotion wins.
   * - Lower priority than current: ignored.
   */
  setState(emotion: EmotionState): void {
    if (this._currentState === emotion) return;

    const currentConfig = EMOTION_CONFIGS[this._currentState];
    const newConfig = EMOTION_CONFIGS[emotion];

    // Priority check: lower priority cannot override higher
    if (newConfig.priority < currentConfig.priority) return;

    this._beginTransition(emotion);
  }

  /** Force-set an emotion regardless of priority. */
  forceState(emotion: EmotionState): void {
    if (this._currentState === emotion) return;
    this._beginTransition(emotion);
  }

  /** Get the current emotion state. */
  getState(): EmotionState {
    return this._currentState;
  }

  /**
   * Frame update. Must be called every frame with delta time in seconds.
   * Handles blending, decay, blink, and breathing.
   */
  update(delta: number): void {
    if (!this._vrm?.expressionManager) return;

    this._totalElapsed += delta;
    this._elapsedSinceStateChange += delta;

    const manager = this._vrm.expressionManager;

    // --- Expression blending ---
    this._updateBlending(delta, manager);

    // --- Natural decay ---
    this._updateDecay();

    // --- Blink (independent layer) ---
    this._updateBlink(delta, manager);

    // --- Eye darts (independent layer) ---
    this._updateEyeDart(delta, manager);

    // --- Idle mouth micro-expressions (independent layer) ---
    this._updateIdleMouth(delta, manager);

    // --- Breathing (independent layer) ---
    this._updateBreathing(delta);
  }

  /** Trigger a manual blink. */
  triggerBlink(): void {
    if (!this._isBlinking) {
      this._isBlinking = true;
      this._blinkProgress = 0;
    }
  }

  /** Enable or disable the auto-blink system. */
  setBlinkEnabled(enabled: boolean): void {
    this._blinkEnabled = enabled;
    if (!enabled) {
      this._isBlinking = false;
      // Reset blink expression
      this._applyBlink(0);
    }
  }

  /** Enable or disable the breathing oscillation. */
  setBreathingEnabled(enabled: boolean): void {
    this._breathingEnabled = enabled;
    if (!enabled && this._vrm?.scene) {
      this._vrm.scene.scale.setY(1.0);
    }
  }

  /** Reset to neutral state. */
  reset(): void {
    this._currentState = "neutral";
    this._fromWeights = new Map();
    this._toWeights = new Map();
    this._transitionProgress = 1.0;
    this._activeWeights = new Map();
    this._elapsedSinceStateChange = 0;
    this._blinkTimer = randomBlinkInterval();
    this._isBlinking = false;
    this._blinkProgress = 0;
    this._breathPhase = 0;
    this._mouthTimer = 0;
    this._mouthNextInterval = randomMouthInterval();
    this._mouthActive = false;
    this._mouthProgress = 0;
    this._eyeDartTimer = 0;
    this._eyeDartNextInterval = randomEyeDartInterval();
    this._eyeDartActive = false;
    this._eyeDartProgress = 0;
    this._totalElapsed = 0;
  }

  // ---------- Private Methods ----------

  private _beginTransition(emotion: EmotionState): void {
    // Snapshot current active weights as the "from" state
    this._fromWeights = new Map(this._activeWeights);

    // Build target weights for the new emotion
    const newTargets = new Map<string, number>();

    // Start with all emotion presets at 0
    for (const preset of ALL_EXPRESSION_PRESETS) {
      const resolved = this._resolveExpression(preset);
      newTargets.set(resolved, 0);
    }

    // Apply the new emotion's expression targets
    const config = EMOTION_CONFIGS[emotion];
    for (const [presetName, weight] of Object.entries(config.expressions)) {
      // Skip blink in sleepy config — blink is handled by the independent layer
      if (presetName === VRMExpressionPresetName.Blink) continue;
      const resolved = this._resolveExpression(presetName);
      newTargets.set(resolved, weight);
    }

    this._toWeights = newTargets;
    this._transitionProgress = 0;
    this._currentState = emotion;
    this._elapsedSinceStateChange = 0;
  }

  private _updateBlending(
    delta: number,
    manager: NonNullable<VRM["expressionManager"]>,
  ): void {
    if (this._transitionProgress >= 1.0) return;

    this._transitionProgress = Math.min(
      1.0,
      this._transitionProgress + delta / TRANSITION_DURATION,
    );
    const t = smoothstep(this._transitionProgress);

    // Collect all expression names from both from and to weights
    const allNames = new Set([
      ...this._fromWeights.keys(),
      ...this._toWeights.keys(),
    ]);

    for (const name of allNames) {
      const fromWeight = this._fromWeights.get(name) ?? 0;
      const toWeight = this._toWeights.get(name) ?? 0;
      const blended = clamp01(lerp(fromWeight, toWeight, t));

      this._activeWeights.set(name, blended);
      manager.setValue(name, blended);
    }
  }

  private _updateDecay(): void {
    const config = EMOTION_CONFIGS[this._currentState];

    // Check if current emotion should decay
    if (
      config.decayTime !== Infinity &&
      this._elapsedSinceStateChange >= config.decayTime
    ) {
      // Decay to neutral
      this._beginTransition("neutral");
    }
  }

  private _updateBlink(
    delta: number,
    manager: NonNullable<VRM["expressionManager"]>,
  ): void {
    if (!this._blinkEnabled) return;

    // Auto-blink timer
    this._blinkTimer -= delta;
    if (this._blinkTimer <= 0 && !this._isBlinking) {
      this._isBlinking = true;
      this._blinkProgress = 0;
      this._blinkTimer = randomBlinkInterval();
    }

    if (this._isBlinking) {
      this._blinkProgress += delta;
      const blinkT = this._blinkProgress / BLINK_DURATION;

      // Triangle wave: 0 -> 1 -> 0 over BLINK_DURATION
      const blinkWeight =
        blinkT <= 0.5 ? blinkT * 2 : (1 - blinkT) * 2;
      const clampedWeight = clamp01(blinkWeight);

      this._applyBlink(clampedWeight, manager);

      if (this._blinkProgress >= BLINK_DURATION) {
        this._isBlinking = false;
        this._applyBlink(0, manager);
      }
    }
  }

  /**
   * Apply blink weight additively on top of emotion expressions.
   * Uses the best available blink expression (unified 'blink' or individual eyes).
   */
  private _applyBlink(
    weight: number,
    manager?: NonNullable<VRM["expressionManager"]>,
  ): void {
    if (!manager && this._vrm?.expressionManager) {
      manager = this._vrm.expressionManager;
    }
    if (!manager) return;

    const blinkName = this._resolveExpression(VRMExpressionPresetName.Blink);
    if (this._expressionMap[VRMExpressionPresetName.Blink]) {
      manager.setValue(blinkName, weight);
      return;
    }

    // Fallback: use individual eye blinks
    const blinkLeftName = this._resolveExpression(
      VRMExpressionPresetName.BlinkLeft,
    );
    const blinkRightName = this._resolveExpression(
      VRMExpressionPresetName.BlinkRight,
    );
    if (this._expressionMap[VRMExpressionPresetName.BlinkLeft]) {
      manager.setValue(blinkLeftName, weight);
    }
    if (this._expressionMap[VRMExpressionPresetName.BlinkRight]) {
      manager.setValue(blinkRightName, weight);
    }
  }

  private _updateEyeDart(
    delta: number,
    manager: NonNullable<VRM["expressionManager"]>,
  ): void {
    if (this._eyeDartActive) {
      this._eyeDartProgress += delta;
      const t = this._eyeDartProgress / EYE_DART_DURATION;

      if (t >= 1.0) {
        // Done — clear expression
        const resolved = this._resolveExpression(this._eyeDartExpression);
        manager.setValue(resolved, 0);
        this._eyeDartActive = false;
        this._eyeDartNextInterval = randomEyeDartInterval();
        this._eyeDartTimer = 0;
      } else {
        // Triangle wave: quick glance
        const weight = t <= 0.5 ? t * 2 * EYE_DART_WEIGHT : (1 - t) * 2 * EYE_DART_WEIGHT;
        const resolved = this._resolveExpression(this._eyeDartExpression);
        manager.setValue(resolved, clamp01(weight));
      }
    } else {
      this._eyeDartTimer += delta;
      if (this._eyeDartTimer >= this._eyeDartNextInterval) {
        // Pick random eye dart direction
        this._eyeDartExpression = EYE_DART_EXPRESSIONS[Math.floor(Math.random() * EYE_DART_EXPRESSIONS.length)];
        this._eyeDartActive = true;
        this._eyeDartProgress = 0;
      }
    }
  }

  private _updateIdleMouth(
    delta: number,
    manager: NonNullable<VRM["expressionManager"]>,
  ): void {
    // Suppress during strong emotions
    if (MOUTH_SUPPRESS_EMOTIONS.has(this._currentState)) {
      if (this._mouthActive) {
        // Clear any active mouth expression
        const resolved = this._resolveExpression(this._mouthExpression);
        manager.setValue(resolved, 0);
        this._mouthActive = false;
      }
      return;
    }

    if (this._mouthActive) {
      // Playing: triangle wave 0 → peak → 0 over _mouthDuration
      this._mouthProgress += delta;
      const t = this._mouthProgress / this._mouthDuration;

      if (t >= 1.0) {
        // Done — clear expression
        const resolved = this._resolveExpression(this._mouthExpression);
        manager.setValue(resolved, 0);
        this._mouthActive = false;
        this._mouthNextInterval = randomMouthInterval();
        this._mouthTimer = 0;
      } else {
        // Triangle wave: up to peak at 0.5, down to 0 at 1.0
        const weight = t <= 0.5 ? t * 2 * MOUTH_PEAK_WEIGHT : (1 - t) * 2 * MOUTH_PEAK_WEIGHT;
        const resolved = this._resolveExpression(this._mouthExpression);
        manager.setValue(resolved, clamp01(weight));
      }
    } else {
      // Waiting: countdown to next mouth expression
      this._mouthTimer += delta;
      if (this._mouthTimer >= this._mouthNextInterval) {
        // Pick a random mouth expression and start it
        this._mouthExpression = MOUTH_EXPRESSIONS[Math.floor(Math.random() * MOUTH_EXPRESSIONS.length)];
        this._mouthActive = true;
        this._mouthProgress = 0;
      }
    }
  }

  private _updateBreathing(delta: number): void {
    if (!this._breathingEnabled || !this._vrm?.scene) return;

    // ~0.2Hz oscillation (2*PI*0.2 = ~1.257 rad/s)
    // BUG-09 fix: Wrap with modulo to prevent unbounded growth.
    // Over hours of runtime, the phase value would grow large enough to degrade
    // floating-point precision, causing jittery breathing animation.
    const TWO_PI = 2 * Math.PI;
    this._breathPhase = (this._breathPhase + delta * TWO_PI * BREATHING_FREQUENCY) % TWO_PI;

    const breathScale = 1.0 + Math.sin(this._breathPhase) * BREATHING_AMPLITUDE;
    this._vrm.scene.scale.setY(breathScale);
  }

  /**
   * Resolve a VRM expression preset name to the actual expression name
   * available on the model. Falls back to the preset name if no mapping exists.
   */
  private _resolveExpression(presetName: string): string {
    return this._expressionMap[presetName] ?? presetName;
  }
}
