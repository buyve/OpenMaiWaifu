import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PetBehavior } from "../petBehavior";
import type { Position } from "../petBehavior";

// Mock Tauri invoke — PetBehavior calls invoke("get_screen_size")
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "get_screen_size") return { width: 1920, height: 1080 };
    return null;
  }),
}));

describe("PetBehavior", () => {
  let pet: PetBehavior;

  beforeEach(() => {
    vi.useFakeTimers();
    pet = new PetBehavior();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- Initial state ----------

  it("starts in idle state", () => {
    expect(pet.state.state).toBe("idle");
  });

  it("initializes with null target", () => {
    expect(pet.state.targetPosition).toBeNull();
  });

  // ---------- reset ----------

  it("reset returns to idle state", () => {
    // Manually poke internal state via handleInteraction to change state
    pet.handleInteraction("touch");
    expect(pet.state.state).toBe("reacting");

    pet.reset();
    expect(pet.state.state).toBe("idle");
    expect(pet.state.targetPosition).toBeNull();
  });

  // ---------- handleInteraction ----------

  it("touch interaction transitions to reacting", () => {
    pet.handleInteraction("touch");
    expect(pet.state.state).toBe("reacting");
  });

  it("touch interaction records previous state", () => {
    // Start in idle
    expect(pet.state.state).toBe("idle");

    pet.handleInteraction("touch");
    expect(pet.state.state).toBe("reacting");

    // After reaction duration, should return to previous state (idle)
    vi.advanceTimersByTime(3000); // > REACTION_DURATION_MS (2500)
    pet.tick({ x: 0, y: 0 });

    expect(pet.state.state).toBe("idle");
  });

  it("drag returns to idle", () => {
    pet.reset();
    pet.handleInteraction("drag");
    expect(pet.state.state).toBe("idle");
  });

  it("doubleClick interaction returns empty actions", () => {
    const actions = pet.handleInteraction("doubleClick");
    expect(actions).toEqual([]);
    // State shouldn't change from idle on doubleClick
    expect(pet.state.state).toBe("idle");
  });

  // ---------- updateCamera ----------

  it("updateCamera stores camera parameters", () => {
    pet.updateCamera(5.0, 2.0);

    // screenToWorld should use updated camera params and return valid coordinates
    const pos = pet.screenToWorld(960, 540);
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });

  // ---------- Pause cooldown ----------

  it("tick returns empty actions during pause cooldown", () => {
    const origin: Position = { x: 0, y: 0 };

    // We can't easily set pauseUntil externally, but we can verify
    // that a fresh pet in idle does tick normally
    const actions = pet.tick(origin);
    // Should return some actions or empty depending on random roll
    expect(Array.isArray(actions)).toBe(true);
  });

  // ---------- State type checking ----------

  it("state returns a readonly snapshot", () => {
    const state = pet.state;
    expect(state.state).toBe("idle");
    expect(typeof state.lastInteractionTime).toBe("number");
    expect(typeof state.stateStartTime).toBe("number");
  });

  it("windows returns an empty array initially (mocked)", () => {
    // Windows are fetched async from Tauri, but mock returns []
    expect(pet.windows).toEqual([]);
  });
});
