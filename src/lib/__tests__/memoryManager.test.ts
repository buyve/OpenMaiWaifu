import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryManager, detectEmotion } from "../memoryManager";
import type { Memory } from "../memoryManager";

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key in mockStorage) delete mockStorage[key];
  }),
  get length() {
    return Object.keys(mockStorage).length;
  },
  key: vi.fn((i: number) => Object.keys(mockStorage)[i] ?? null),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("MemoryManager", () => {
  let manager: MemoryManager;

  beforeEach(async () => {
    localStorageMock.clear();
    vi.clearAllMocks();
    manager = new MemoryManager();
    await manager.initialize();
  });

  // ---------- trackKnowledge (add memory) ----------

  it("trackKnowledge creates a memory and persists it", async () => {
    const mem = manager.trackKnowledge("User likes cats", "M0");

    expect(mem.content).toBe("User likes cats");
    expect(mem.tier).toBe("M0");
    expect(mem.id).toMatch(/^local-/);

    const all = await manager.getMemories();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe("User likes cats");
  });

  it("trackKnowledge auto-detects emotions from content", () => {
    const mem = manager.trackKnowledge("너무 좋아! 행복해!");
    expect(mem.emotions).toContain("joy");
    expect(mem.intensity).toBeGreaterThan(0.1);
  });

  it("trackKnowledge uses provided emotions when specified", () => {
    const mem = manager.trackKnowledge("Test", "M30", {
      emotions: ["sadness", "anger"],
      intensity: 0.8,
    });
    expect(mem.emotions).toEqual(["sadness", "anger"]);
    expect(mem.intensity).toBe(0.8);
  });

  it("trackKnowledge sets correct expiresAt for timed tiers", () => {
    const m30 = manager.trackKnowledge("short term", "M30");
    expect(m30.expiresAt).not.toBeNull();
    // M30 = 30 days
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(m30.expiresAt! - m30.createdAt).toBe(thirtyDaysMs);

    const m0 = manager.trackKnowledge("core memory", "M0");
    expect(m0.expiresAt).toBeNull(); // never expires
  });

  // ---------- getMemories ----------

  it("getMemories returns all memories", async () => {
    manager.trackKnowledge("A");
    manager.trackKnowledge("B");
    manager.trackKnowledge("C");

    const all = await manager.getMemories();
    expect(all).toHaveLength(3);
  });

  it("getMemories filters by tier", async () => {
    manager.trackKnowledge("core", "M0");
    manager.trackKnowledge("short", "M30");
    manager.trackKnowledge("mid", "M90");

    const m0 = await manager.getMemories("M0");
    expect(m0).toHaveLength(1);
    expect(m0[0].content).toBe("core");

    const m30 = await manager.getMemories("M30");
    expect(m30).toHaveLength(1);
    expect(m30[0].content).toBe("short");
  });

  it("getMemories returns empty array when no memories", async () => {
    const all = await manager.getMemories();
    expect(all).toEqual([]);
  });

  // ---------- deleteMemory ----------

  it("deleteMemory removes a memory by ID", async () => {
    const mem = manager.trackKnowledge("Delete me");
    expect(await manager.getMemories()).toHaveLength(1);

    const result = await manager.deleteMemory(mem.id);
    expect(result).toBe(true);
    expect(await manager.getMemories()).toHaveLength(0);
  });

  it("deleteMemory returns false for nonexistent ID", async () => {
    const result = await manager.deleteMemory("nonexistent-id");
    expect(result).toBe(false);
  });

  // ---------- deleteAll ----------

  it("deleteAll removes all memories", async () => {
    manager.trackKnowledge("A");
    manager.trackKnowledge("B");
    expect(await manager.getMemories()).toHaveLength(2);

    const result = await manager.deleteAll();
    expect(result).toBe(true);
    expect(await manager.getMemories()).toHaveLength(0);
  });

  // ---------- exportAll ----------

  it("exportAll returns all memories", async () => {
    manager.trackKnowledge("export me", "M0");
    manager.trackKnowledge("export me too", "M30");

    const exported = await manager.exportAll();
    expect(exported).toHaveLength(2);
  });

  // ---------- getStats ----------

  it("getStats returns correct counts", async () => {
    manager.trackKnowledge("a", "M0");
    manager.trackKnowledge("b", "M30");
    manager.trackKnowledge("c", "M30");

    const stats = await manager.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byTier.M0).toBe(1);
    expect(stats.byTier.M30).toBe(2);
  });

  it("getStats returns zero when empty", async () => {
    const stats = await manager.getStats();
    expect(stats.total).toBe(0);
  });

  // ---------- softDeleteMemory ----------

  it("softDeleteMemory moves memory to forgetting queue", async () => {
    const mem = manager.trackKnowledge("soft delete me", "M30");

    const result = await manager.softDeleteMemory(mem.id);
    expect(result).toBe(true);

    // Memory removed from active
    expect(await manager.getMemories()).toHaveLength(0);

    // Memory in forgetting queue
    const queue = manager.getForgettingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].memory.content).toBe("soft delete me");
    expect(queue[0].reason).toBe("manual");
  });

  it("softDeleteMemory blocks M0 without force flag", async () => {
    const mem = manager.trackKnowledge("core memory", "M0");

    const result = await manager.softDeleteMemory(mem.id);
    expect(result).toBe(false);

    // Memory still active
    expect(await manager.getMemories()).toHaveLength(1);
  });

  it("softDeleteMemory allows M0 with force flag", async () => {
    const mem = manager.trackKnowledge("core memory", "M0");

    const result = await manager.softDeleteMemory(mem.id, true);
    expect(result).toBe(true);
    expect(await manager.getMemories()).toHaveLength(0);
  });

  // ---------- restoreFromForgettingQueue ----------

  it("restoreFromForgettingQueue restores a memory", async () => {
    const mem = manager.trackKnowledge("restore me", "M30");
    await manager.softDeleteMemory(mem.id);

    expect(await manager.getMemories()).toHaveLength(0);

    const restored = manager.restoreFromForgettingQueue(mem.id);
    expect(restored).toBe(true);

    const memories = await manager.getMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("restore me");

    // Queue should be empty
    expect(manager.getForgettingQueue()).toHaveLength(0);
  });

  it("restoreFromForgettingQueue returns false for unknown ID", () => {
    const result = manager.restoreFromForgettingQueue("nonexistent");
    expect(result).toBe(false);
  });

  // ---------- runExpirationCheck ----------

  it("runExpirationCheck moves expired memories to forgetting queue", () => {
    // Manually insert a memory with past expiresAt
    const now = Date.now();
    const expiredMemory: Memory = {
      id: "expired-1",
      content: "I am expired",
      tier: "M30",
      emotions: ["neutral"],
      intensity: 0.1,
      createdAt: now - 31 * 24 * 60 * 60 * 1000,
      expiresAt: now - 1000, // already expired
      promotedFrom: null,
      referenceCount: 0,
      lastReferencedAt: null,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now - 31 * 24 * 60 * 60 * 1000,
      accessCount: 0,
    };
    mockStorage["companion_memories"] = JSON.stringify([expiredMemory]);

    const result = manager.runExpirationCheck();
    expect(result.expired).toBe(1);

    const queue = manager.getForgettingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].memory.id).toBe("expired-1");
    expect(queue[0].reason).toBe("expired");
  });

  // ---------- runPromotionPipeline ----------

  it("promotes M30 to M90 when aged >= 7 days with high references", async () => {
    const now = Date.now();
    const oldMemory: Memory = {
      id: "promote-1",
      content: "Promote me",
      tier: "M30",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 8 * 24 * 60 * 60 * 1000, // 8 days old
      expiresAt: now + 22 * 24 * 60 * 60 * 1000,
      promotedFrom: null,
      referenceCount: 5, // >= 3 threshold
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 5,
    };
    mockStorage["companion_memories"] = JSON.stringify([oldMemory]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M30");
    expect(result.promoted[0].to).toBe("M90");
  });

  it("does not promote M30 if too young", async () => {
    const now = Date.now();
    const youngMemory: Memory = {
      id: "young-1",
      content: "Too young",
      tier: "M30",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 3 * 24 * 60 * 60 * 1000, // 3 days old
      expiresAt: now + 27 * 24 * 60 * 60 * 1000,
      promotedFrom: null,
      referenceCount: 10,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 10,
    };
    mockStorage["companion_memories"] = JSON.stringify([youngMemory]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(0);
  });

  // ---------- Flashbulb Memory ----------

  it("flashbulb: promotes M30 with intensity >= 0.96 after 1 day (age waived)", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const flashbulbMemory: Memory = {
      id: "flashbulb-1",
      content: "Extreme flashbulb memory",
      tier: "M30",
      emotions: ["joy", "fear", "sadness"],
      intensity: 0.96, // >= 0.95 threshold
      createdAt: now - 1 * DAY, // only 1 day old
      expiresAt: now + 29 * DAY,
      promotedFrom: null,
      referenceCount: 3, // meets quality threshold
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 3,
    };
    mockStorage["companion_memories"] = JSON.stringify([flashbulbMemory]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M30");
    expect(result.promoted[0].to).toBe("M90");
  });

  it("flashbulb: promotes M30 with intensity >= 0.85 after 3.5 days (halved age)", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const mildFlashbulb: Memory = {
      id: "mild-flash-1",
      content: "Mild flashbulb memory",
      tier: "M30",
      emotions: ["joy", "sadness"],
      intensity: 0.87, // >= 0.85, < 0.95
      createdAt: now - 4 * DAY, // 4 days (>= 3.5 halved requirement)
      expiresAt: now + 26 * DAY,
      promotedFrom: null,
      referenceCount: 5,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 5,
    };
    mockStorage["companion_memories"] = JSON.stringify([mildFlashbulb]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M30");
    expect(result.promoted[0].to).toBe("M90");
  });

  // ---------- Temporal Spread ----------

  it("temporal spread: promotes M30 with spread >= 3 days", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const spreadMemory: Memory = {
      id: "spread-1",
      content: "Temporal spread memory",
      tier: "M30",
      emotions: ["neutral"],
      intensity: 0.3, // low intensity, no quality threshold met
      createdAt: now - 8 * DAY,
      expiresAt: now + 22 * DAY,
      promotedFrom: null,
      referenceCount: 1, // below 3 threshold
      lastReferencedAt: now - 4 * DAY, // spread = 8 - 4 = 4 days >= 3
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 1,
    };
    mockStorage["companion_memories"] = JSON.stringify([spreadMemory]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M30");
    expect(result.promoted[0].to).toBe("M90");
  });

  // ---------- M90 → M365 Promotion ----------

  it("promotes M90 to M365 when aged >= 30 days with refs >= 5", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const m90Memory: Memory = {
      id: "promote-m90-1",
      content: "M90 candidate for M365",
      tier: "M90",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 35 * DAY, // 35 days old (>= 30)
      expiresAt: now + 55 * DAY,
      promotedFrom: null,
      referenceCount: 6, // >= 5 threshold
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 6,
    };
    mockStorage["companion_memories"] = JSON.stringify([m90Memory]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M90");
    expect(result.promoted[0].to).toBe("M365");
  });

  it("does not promote M90 to M365 if too young", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const youngM90: Memory = {
      id: "young-m90-1",
      content: "Young M90",
      tier: "M90",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 15 * DAY, // 15 days old (< 30)
      expiresAt: now + 75 * DAY,
      promotedFrom: null,
      referenceCount: 10,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 10,
    };
    mockStorage["companion_memories"] = JSON.stringify([youngM90]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(0);
  });

  it("promotes M90 to M365 via personalityIsland link", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const islandM90: Memory = {
      id: "island-m90-1",
      content: "M90 with personality island",
      tier: "M90",
      emotions: ["neutral"],
      intensity: 0.3,
      createdAt: now - 40 * DAY,
      expiresAt: now + 50 * DAY,
      promotedFrom: null,
      referenceCount: 0, // no refs, but has island
      lastReferencedAt: null,
      personalityIsland: "island-123",
      source: "conversation",
      lastAccessed: now,
      accessCount: 0,
    };
    mockStorage["companion_memories"] = JSON.stringify([islandM90]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M90");
    expect(result.promoted[0].to).toBe("M365");
  });

  it("promotes M90 to M365 via high emotion (intensity > 0.8, 2+ distinct emotions)", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const emotionalM90: Memory = {
      id: "emotional-m90-1",
      content: "Highly emotional M90",
      tier: "M90",
      emotions: ["joy", "sadness", "fear"],
      intensity: 0.85,
      createdAt: now - 35 * DAY,
      expiresAt: now + 55 * DAY,
      promotedFrom: null,
      referenceCount: 0, // no refs
      lastReferencedAt: null,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 0,
    };
    mockStorage["companion_memories"] = JSON.stringify([emotionalM90]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M90");
    expect(result.promoted[0].to).toBe("M365");
  });

  it("promotes M90 to M365 via temporal spread >= 14 days", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const spreadM90: Memory = {
      id: "spread-m90-1",
      content: "Temporal spread M90",
      tier: "M90",
      emotions: ["neutral"],
      intensity: 0.3, // low quality
      createdAt: now - 40 * DAY,
      expiresAt: now + 50 * DAY,
      promotedFrom: null,
      referenceCount: 1, // below 5 threshold
      lastReferencedAt: now - 20 * DAY, // spread = 40 - 20 = 20 days >= 14
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 1,
    };
    mockStorage["companion_memories"] = JSON.stringify([spreadM90]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M90");
    expect(result.promoted[0].to).toBe("M365");
  });

  it("flashbulb: promotes M90 with intensity >= 0.95 after 1 day (age waived)", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const flashM90: Memory = {
      id: "flash-m90-1",
      content: "Extreme flashbulb M90",
      tier: "M90",
      emotions: ["joy", "fear"],
      intensity: 0.96, // >= 0.95
      createdAt: now - 2 * DAY, // only 2 days (age waived)
      expiresAt: now + 88 * DAY,
      promotedFrom: null,
      referenceCount: 5,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 5,
    };
    mockStorage["companion_memories"] = JSON.stringify([flashM90]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M90");
    expect(result.promoted[0].to).toBe("M365");
  });

  // ---------- M365→M0: Oldest-first ordering ----------

  it("auto M0: promotes oldest M365 first when multiple qualify", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const makeM365 = (id: string, ageDays: number): Memory => ({
      id,
      content: `M365 candidate ${id}`,
      tier: "M365",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - ageDays * DAY,
      expiresAt: now + (365 - ageDays) * DAY,
      promotedFrom: null,
      referenceCount: 15,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 15,
    });
    // Insert in non-age order: 200d, 300d, 250d
    mockStorage["companion_memories"] = JSON.stringify([
      makeM365("age-200", 200),
      makeM365("age-300", 300),
      makeM365("age-250", 250),
    ]);

    const result = await manager.runPromotionPipeline();
    const m0Promotions = result.promoted.filter((p) => p.to === "M0");
    expect(m0Promotions).toHaveLength(1);
    expect(m0Promotions[0].id).toBe("age-300"); // oldest should be promoted
  });

  // ---------- Auto M0 Promotion ----------

  it("auto M0: promotes M365 with age >= 180 days and refs >= 10", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const oldM365: Memory = {
      id: "auto-m0-1",
      content: "Long-lived important memory",
      tier: "M365",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 200 * DAY, // 200 days (>= 180)
      expiresAt: now + 165 * DAY,
      promotedFrom: null,
      referenceCount: 12, // >= 10
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 12,
    };
    mockStorage["companion_memories"] = JSON.stringify([oldM365]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0].from).toBe("M365");
    expect(result.promoted[0].to).toBe("M0");
    expect(result.newM0).toHaveLength(1);
  });

  it("auto M0: safety cap limits to 1 per run", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const makeM365 = (id: string): Memory => ({
      id,
      content: `M365 candidate ${id}`,
      tier: "M365",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 200 * DAY,
      expiresAt: now + 165 * DAY,
      promotedFrom: null,
      referenceCount: 15,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 15,
    });
    mockStorage["companion_memories"] = JSON.stringify([
      makeM365("cap-1"),
      makeM365("cap-2"),
      makeM365("cap-3"),
    ]);

    const result = await manager.runPromotionPipeline();
    const m0Promotions = result.promoted.filter((p) => p.to === "M0");
    expect(m0Promotions).toHaveLength(1); // safety cap = 1
    expect(result.newM0).toHaveLength(1);
  });

  it("auto M0: does not promote M365 under 180 days", async () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const youngM365: Memory = {
      id: "young-m365",
      content: "Young M365",
      tier: "M365",
      emotions: ["joy"],
      intensity: 0.5,
      createdAt: now - 100 * DAY, // only 100 days
      expiresAt: now + 265 * DAY,
      promotedFrom: null,
      referenceCount: 20,
      lastReferencedAt: now,
      personalityIsland: null,
      source: "conversation",
      lastAccessed: now,
      accessCount: 20,
    };
    mockStorage["companion_memories"] = JSON.stringify([youngM365]);

    const result = await manager.runPromotionPipeline();
    expect(result.promoted).toHaveLength(0);
    expect(result.newM0).toHaveLength(0);
  });

  // ---------- getLastConversationMemory ----------

  it("getLastConversationMemory returns most recent conversation memory", () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const memories: Memory[] = [
      {
        id: "chat-old", content: "first chat", tier: "M30",
        emotions: ["neutral"], intensity: 0.1,
        createdAt: now - 2 * DAY, expiresAt: now + 28 * DAY,
        promotedFrom: null, referenceCount: 0, lastReferencedAt: null,
        personalityIsland: null, source: "conversation",
        lastAccessed: now - 2 * DAY, accessCount: 0,
      },
      {
        id: "chat-new", content: "second chat", tier: "M30",
        emotions: ["neutral"], intensity: 0.1,
        createdAt: now - 1 * DAY, expiresAt: now + 29 * DAY,
        promotedFrom: null, referenceCount: 0, lastReferencedAt: null,
        personalityIsland: null, source: "conversation",
        lastAccessed: now - 1 * DAY, accessCount: 0,
      },
      {
        id: "obs-1", content: "observation", tier: "M30",
        emotions: ["neutral"], intensity: 0.1,
        createdAt: now, expiresAt: now + 30 * DAY,
        promotedFrom: null, referenceCount: 0, lastReferencedAt: null,
        personalityIsland: null, source: "observation",
        lastAccessed: now, accessCount: 0,
      },
    ];
    mockStorage["companion_memories"] = JSON.stringify(memories);

    const last = manager.getLastConversationMemory();
    expect(last).not.toBeNull();
    expect(last!.content).toBe("second chat");
  });

  it("getLastConversationMemory returns null when no conversation memories", () => {
    manager.trackKnowledge("observation only", "M30", { source: "observation" });
    const last = manager.getLastConversationMemory();
    expect(last).toBeNull();
  });

  // ---------- blacklist checker ----------

  it("filters memories based on blacklist checker", async () => {
    manager.trackKnowledge("safe content");
    manager.trackKnowledge("secret password 123");

    manager.setBlacklistChecker((content) => content.includes("secret"));

    const memories = await manager.getMemories();
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe("safe content");
  });

  // ---------- getContextForChat ----------

  it("getContextForChat returns formatted context string", async () => {
    manager.trackKnowledge("User likes TypeScript", "M0");
    manager.trackKnowledge("Had a good day", "M30", { emotions: ["joy"] });

    const context = await manager.getContextForChat();
    expect(context).toContain("User likes TypeScript");
    expect(context).toContain("Had a good day");
  });

  it("getContextForChat returns empty string when no memories", async () => {
    const context = await manager.getContextForChat();
    expect(context).toBe("");
  });

  it("getContextForChat prioritizes M0 over M30", async () => {
    // Add M30 first, then M0
    manager.trackKnowledge("M30 memory", "M30");
    manager.trackKnowledge("M0 core memory", "M0");

    const context = await manager.getContextForChat();
    const lines = context.split("\n");
    // M0 should appear before M30
    const m0Index = lines.findIndex((l) => l.includes("M0 core memory"));
    const m30Index = lines.findIndex((l) => l.includes("M30 memory"));
    expect(m0Index).toBeLessThan(m30Index);
  });

  // ---------- isUsingOpenClaw ----------

  it("isUsingOpenClaw returns false (always local)", () => {
    expect(manager.isUsingOpenClaw()).toBe(false);
  });
});

// ---------- detectEmotion (standalone function) ----------

describe("detectEmotion", () => {
  it("detects joy from Korean keywords", () => {
    const result = detectEmotion("너무 좋아! 행복해!");
    expect(result.emotions).toContain("joy");
  });

  it("detects sadness from Korean keywords", () => {
    const result = detectEmotion("너무 슬프다 우울해");
    expect(result.emotions).toContain("sadness");
  });

  it("detects anger from English keywords", () => {
    const result = detectEmotion("I hate this, so angry");
    expect(result.emotions).toContain("anger");
  });

  it("detects multiple emotions", () => {
    const result = detectEmotion("좋아하지만 걱정되고 긴장돼");
    expect(result.emotions.length).toBeGreaterThanOrEqual(2);
  });

  it("returns neutral for emotionless text", () => {
    const result = detectEmotion("The weather is 22 degrees");
    expect(result.emotions).toEqual(["neutral"]);
    expect(result.intensity).toBe(0.1);
  });

  it("limits emotions to max 3", () => {
    // Text with many emotion keywords
    const result = detectEmotion(
      "좋아 슬프다 화나 무섭다 역겹다 불안 부럽다 지루하다 그리움",
    );
    expect(result.emotions.length).toBeLessThanOrEqual(3);
  });

  it("intensity increases with more keyword matches", () => {
    const low = detectEmotion("좋아");
    const high = detectEmotion("좋아 행복 기쁨 최고 감사 사랑");
    expect(high.intensity).toBeGreaterThan(low.intensity);
  });

  it("intensity caps at 1.0", () => {
    const result = detectEmotion(
      "좋아 행복 기쁨 최고 감사 사랑 칭찬 좋은 잘했 축하 happy great love thanks awesome nice",
    );
    expect(result.intensity).toBeLessThanOrEqual(1.0);
  });
});
