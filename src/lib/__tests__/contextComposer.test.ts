import { describe, it, expect, vi } from "vitest";
import { composeContext } from "../contextComposer";

// Minimal mock types matching the interfaces used by composeContext
function createMockSoulManager(soul = "Test soul") {
  return { getSoul: vi.fn(() => soul) } as unknown as import("../soulIdentity").SoulManager;
}

function createMockMemoryManager(context: string | null = "Recent memories here") {
  return {
    getContextForChat: vi.fn(async () => context),
  } as unknown as import("../memoryManager").MemoryManager;
}

function createMockSenseOfSelf(context: string | null = "[Sense of Self] I am caring") {
  return {
    getContextForChat: vi.fn(() => context),
  } as unknown as import("../senseOfSelf").SenseOfSelfManager;
}

function createMockIslandManager(context: string | null = "[Personality Islands]\n- Kindness") {
  return {
    getContextForChat: vi.fn(() => context),
  } as unknown as import("../personalityIslands").IslandManager;
}

describe("composeContext", () => {
  it("includes SYSTEM section from soul", async () => {
    const result = await composeContext(
      createMockSoulManager("My soul text"),
      createMockMemoryManager(null),
    );
    expect(result).toContain("[SYSTEM]");
    expect(result).toContain("My soul text");
  });

  it("includes MEMORY CONTEXT section", async () => {
    const result = await composeContext(
      createMockSoulManager(),
      createMockMemoryManager("Memory data"),
    );
    expect(result).toContain("[MEMORY CONTEXT]");
    expect(result).toContain("Memory data");
  });

  it("includes personality islands when provided", async () => {
    const result = await composeContext(
      createMockSoulManager(),
      createMockMemoryManager(),
      undefined,
      createMockIslandManager("[Personality Islands]\n- Creativity"),
    );
    expect(result).toContain("Creativity");
  });

  it("includes sense of self when provided", async () => {
    const result = await composeContext(
      createMockSoulManager(),
      createMockMemoryManager(),
      createMockSenseOfSelf("[Sense of Self] I am brave"),
    );
    expect(result).toContain("I am brave");
  });

  it("composes all sections together", async () => {
    const result = await composeContext(
      createMockSoulManager("Soul"),
      createMockMemoryManager("Memory"),
      createMockSenseOfSelf("Self"),
      createMockIslandManager("Islands"),
    );
    expect(result).toContain("Soul");
    expect(result).toContain("Memory");
    expect(result).toContain("Self");
    expect(result).toContain("Islands");
  });

  it("omits null sections gracefully", async () => {
    const result = await composeContext(
      createMockSoulManager(""),
      createMockMemoryManager(null),
    );
    // Empty soul string is falsy -> no SYSTEM section
    expect(result).not.toContain("[SYSTEM]");
    expect(result).not.toContain("[MEMORY CONTEXT]");
  });

  it("separates sections with double newlines", async () => {
    const result = await composeContext(
      createMockSoulManager("Soul"),
      createMockMemoryManager("Memory"),
    );
    expect(result).toContain("\n\n");
    const parts = result.split("\n\n");
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});
