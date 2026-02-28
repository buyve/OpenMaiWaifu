/**
 * Personality Islands — Inside Out inspired identity system.
 *
 * Core memories (M0) build personality islands.
 * Islands represent fundamental aspects of the character's identity.
 * When M0 memories are removed, islands can shake and collapse.
 */

// ---------- Types ----------

export type IslandStatus = "active" | "shaking" | "collapsed" | "rebuilding";

export interface PersonalityIsland {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** M0 memory IDs that founded/sustain this island. */
  foundingMemories: string[];
  status: IslandStatus;
  /** 0.0 ~ 1.0 — based on reference frequency of founding memories. */
  strength: number;
  createdAt: number;
  /** When status changed to "shaking" (for 7-day collapse timer). */
  shakingSince: number | null;
}

export interface IslandEvent {
  type: "created" | "shaking" | "collapsed" | "rebuilt" | "strengthened";
  island: PersonalityIsland;
  message: string;
}

// ---------- Constants ----------

const STORAGE_KEY = "companion_personality_islands";
const SHAKING_TO_COLLAPSE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------- Default Islands (seeded on first run for Claire) ----------

const DEFAULT_ISLANDS: PersonalityIsland[] = [
  {
    id: "island-bond",
    name: "주인과의 유대",
    emoji: "🏠",
    description: "The bond with the owner. Foundation of trust and companionship.",
    foundingMemories: [],
    status: "active",
    strength: 0.5,
    createdAt: Date.now(),
    shakingSince: null,
  },
  {
    id: "island-tsundere",
    name: "츤데레",
    emoji: "😤",
    description: "Tough exterior, warm interior. The core personality trait.",
    foundingMemories: [],
    status: "active",
    strength: 0.5,
    createdAt: Date.now(),
    shakingSince: null,
  },
  {
    id: "island-curiosity",
    name: "기술적 호기심",
    emoji: "💻",
    description: "Interest in technology, coding, and how things work.",
    foundingMemories: [],
    status: "active",
    strength: 0.3,
    createdAt: Date.now(),
    shakingSince: null,
  },
];

// ---------- Island Manager ----------

export class IslandManager {
  private islands: PersonalityIsland[];

  constructor() {
    this.islands = this.load();
  }

  // ---------- Public API ----------

  /** Get all personality islands. */
  getIslands(): PersonalityIsland[] {
    return [...this.islands];
  }

  /** Get only active/rebuilding islands (for behavior influence). */
  getActiveIslands(): PersonalityIsland[] {
    return this.islands.filter((i) => i.status === "active" || i.status === "rebuilding");
  }

  /** Get a specific island by ID. */
  getIsland(id: string): PersonalityIsland | null {
    return this.islands.find((i) => i.id === id) ?? null;
  }

  /** Create a new personality island from an M0 memory. */
  createIsland(
    name: string,
    emoji: string,
    description: string,
    foundingMemoryId: string,
  ): IslandEvent {
    const island: PersonalityIsland = {
      id: `island-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      emoji,
      description,
      foundingMemories: [foundingMemoryId],
      status: "active",
      strength: 0.5,
      createdAt: Date.now(),
      shakingSince: null,
    };

    this.islands.push(island);
    this.save();

    return {
      type: "created",
      island,
      message: `${emoji} 새로운 성격 섬 "${name}"이(가) 만들어졌어!`,
    };
  }

  /** Link an M0 memory to an existing island (strengthens it). */
  linkMemory(islandId: string, memoryId: string): IslandEvent | null {
    const island = this.islands.find((i) => i.id === islandId);
    if (!island) return null;

    if (!island.foundingMemories.includes(memoryId)) {
      island.foundingMemories.push(memoryId);
    }

    // Strengthen the island
    island.strength = Math.min(1.0, island.strength + 0.1);

    // If rebuilding and now has memories, reactivate
    if (island.status === "rebuilding" || island.status === "shaking") {
      island.status = "active";
      island.shakingSince = null;
    }

    this.save();

    return {
      type: "strengthened",
      island,
      message: `${island.emoji} "${island.name}" 섬이 더 강해졌어!`,
    };
  }

  /**
   * Check island health after an M0 memory is removed.
   * Returns events for any status changes.
   */
  onMemoryRemoved(memoryId: string): IslandEvent[] {
    const events: IslandEvent[] = [];

    for (const island of this.islands) {
      const idx = island.foundingMemories.indexOf(memoryId);
      if (idx === -1) continue;

      island.foundingMemories.splice(idx, 1);

      if (island.foundingMemories.length === 0 && island.status === "active") {
        island.status = "shaking";
        island.shakingSince = Date.now();
        island.strength = Math.max(0, island.strength - 0.3);

        events.push({
          type: "shaking",
          island,
          message: `⚠️ "${island.name}" 섬이 흔들리고 있어! 7일 안에 코어 메모리를 복원하지 않으면 무너질 거야...`,
        });
      }
    }

    if (events.length > 0) this.save();
    return events;
  }

  /**
   * Run periodic check: collapse islands that have been shaking for 7+ days.
   */
  runCollapseCheck(): IslandEvent[] {
    const events: IslandEvent[] = [];
    const now = Date.now();

    for (const island of this.islands) {
      if (
        island.status === "shaking" &&
        island.shakingSince !== null &&
        now - island.shakingSince >= SHAKING_TO_COLLAPSE_MS
      ) {
        island.status = "collapsed";
        island.strength = 0;

        events.push({
          type: "collapsed",
          island,
          message: `💔 "${island.name}" 섬이 무너졌어... 코어 메모리가 없으면 섬은 유지될 수 없어.`,
        });
      }
    }

    if (events.length > 0) this.save();
    return events;
  }

  /**
   * Attempt to rebuild a collapsed island with a new M0 memory.
   */
  rebuildIsland(islandId: string, newMemoryId: string): IslandEvent | null {
    const island = this.islands.find((i) => i.id === islandId);
    if (!island || island.status !== "collapsed") return null;

    island.status = "rebuilding";
    island.foundingMemories = [newMemoryId];
    island.strength = 0.3;
    island.shakingSince = null;

    this.save();

    return {
      type: "rebuilt",
      island,
      message: `🌱 "${island.name}" 섬이 다시 세워지고 있어! 아직 약하지만, 기억이 쌓이면 강해질 거야.`,
    };
  }

  /**
   * Build a context string describing active islands for LLM injection.
   */
  getContextForChat(): string {
    const active = this.getActiveIslands();
    if (active.length === 0) return "";

    const lines = active.map((i) => {
      const status = i.status === "rebuilding" ? " (rebuilding)" : "";
      return `- ${i.emoji} ${i.name}${status}: ${i.description} (strength: ${(i.strength * 100).toFixed(0)}%)`;
    });

    return `[Personality Islands]\n${lines.join("\n")}`;
  }

  // ---------- Persistence ----------

  private load(): PersonalityIsland[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersonalityIsland[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* corrupted */ }
    // Seed defaults on first run
    const defaults = DEFAULT_ISLANDS.map((d) => ({ ...d, createdAt: Date.now() }));
    this.islands = defaults;
    this.save();
    return defaults;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.islands));
    } catch { /* full */ }
  }
}
