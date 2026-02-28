import { describe, it, expect, beforeEach } from "vitest";
import { EmotionStateMachine, EMOTION_CONFIGS } from "../emotionStateMachine";
import type { EmotionState } from "../emotionStateMachine";
import type { VRM } from "@pixiv/three-vrm";

/**
 * Minimal VRM mock with a fake expressionManager.
 * The EmotionStateMachine.update() early-returns if vrm.expressionManager is falsy,
 * so we need this mock for decay/blink/breathing tests.
 */
function createMockVRM(): VRM {
  return {
    expressionManager: {
      setValue: () => {},
      getValue: () => 0,
    },
    scene: {
      scale: { y: 1, setY: () => {} },
    },
  } as unknown as VRM;
}

describe("EmotionStateMachine", () => {
  let machine: EmotionStateMachine;

  beforeEach(() => {
    machine = new EmotionStateMachine(createMockVRM());
  });

  // Test 6: setState priority enforcement
  it("higher priority emotion overrides lower", () => {
    machine.setState("happy"); // priority 1
    expect(machine.getState()).toBe("happy");

    machine.setState("angry"); // priority 2 > 1
    expect(machine.getState()).toBe("angry");
  });

  it("lower priority cannot override higher", () => {
    machine.setState("angry"); // priority 2
    expect(machine.getState()).toBe("angry");

    machine.setState("happy"); // priority 1 < 2
    expect(machine.getState()).toBe("angry"); // should NOT change
  });

  it("same priority allows override (new wins)", () => {
    machine.setState("happy"); // priority 1
    expect(machine.getState()).toBe("happy");

    machine.setState("sad"); // priority 1 (same)
    expect(machine.getState()).toBe("sad");
  });

  it("forceState bypasses priority", () => {
    machine.setState("surprised"); // priority 3
    expect(machine.getState()).toBe("surprised");

    machine.forceState("neutral"); // priority 0, but forced
    expect(machine.getState()).toBe("neutral");
  });

  // Test 7: decay to neutral fires correctly
  it("decays to neutral after decayTime", () => {
    machine.setState("surprised"); // decayTime: 5 seconds
    expect(machine.getState()).toBe("surprised");

    // Simulate 4 seconds — should NOT decay yet
    machine.update(4);
    expect(machine.getState()).toBe("surprised");

    // Simulate 2 more seconds (total 6) — SHOULD decay
    machine.update(2);
    expect(machine.getState()).toBe("neutral");
  });

  it("neutral and sleepy do not decay (Infinity)", () => {
    machine.setState("neutral");
    machine.update(100);
    expect(machine.getState()).toBe("neutral");

    machine.forceState("sleepy");
    machine.update(100);
    expect(machine.getState()).toBe("sleepy");
  });

  it("decay timer resets when emotion changes", () => {
    machine.setState("happy"); // decayTime: 10
    machine.update(8); // 8s elapsed — should NOT decay yet
    expect(machine.getState()).toBe("happy");

    // Force to angry — resets timer
    machine.forceState("angry"); // decayTime: 8
    machine.update(7); // 7s — should NOT decay
    expect(machine.getState()).toBe("angry");

    machine.update(2); // 9s total for angry — SHOULD decay
    expect(machine.getState()).toBe("neutral");
  });

  // Validate all emotion configs exist
  it("has all 8 emotion configurations", () => {
    const expected: EmotionState[] = [
      "neutral",
      "happy",
      "sad",
      "angry",
      "surprised",
      "relaxed",
      "thinking",
      "sleepy",
    ];
    for (const e of expected) {
      expect(EMOTION_CONFIGS[e]).toBeDefined();
      expect(EMOTION_CONFIGS[e].priority).toBeGreaterThanOrEqual(0);
      expect(EMOTION_CONFIGS[e].decayTime).toBeGreaterThan(0);
    }
  });

  it("initial state is neutral", () => {
    expect(machine.getState()).toBe("neutral");
  });

  it("setting the same emotion does not re-trigger transition", () => {
    machine.setState("happy");
    expect(machine.getState()).toBe("happy");

    // Setting happy again should be a no-op
    machine.setState("happy");
    expect(machine.getState()).toBe("happy");
  });
});
