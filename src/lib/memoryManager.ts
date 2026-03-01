import { invoke } from "@tauri-apps/api/core";
import { log } from "./logger.ts";
import { distillMemories } from "./llmService.ts";
import { locale } from "./i18n";
import {
  TOPIC_CLUSTER_MIN_SIZE,
  TOPIC_CLUSTER_MIN_OVERLAP,
  FLASHBULB_MILD_THRESHOLD,
  FLASHBULB_EXTREME_THRESHOLD,
  SPREAD_M30_TO_M90_DAYS,
  SPREAD_M90_TO_M365_DAYS,
  M0_AUTO_PROMOTE_MIN_AGE_DAYS,
  M0_AUTO_PROMOTE_MIN_REFS,
  M0_AUTO_PROMOTE_MAX_PER_RUN,
} from "./constants.ts";

// ---------- Disk Persistence Helpers ----------

async function persistToDisk(key: string, data: string): Promise<void> {
  try {
    await invoke("write_data_file", { key, data });
  } catch (err) {
    log.error(`[Memory] Failed to persist ${key} to disk:`, err);
  }
}

async function loadFromDisk(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>("read_data_file", { key });
  } catch {
    return null;
  }
}

// ---------- Types ----------

/** Emotion color tags inspired by Inside Out 1 & 2. */
export type EmotionTag =
  | "joy"       // gold — happiness, achievement, praise
  | "sadness"   // blue — loss, failure, parting
  | "anger"     // red — frustration, rage
  | "fear"      // purple — worry, anxiety (IO1)
  | "disgust"   // green — rejection, displeasure
  | "anxiety"   // orange — stress, overthinking (IO2)
  | "envy"      // teal — jealousy (IO2)
  | "ennui"     // navy — boredom, apathy (IO2)
  | "nostalgia" // pink+blue — longing, mixed emotions
  | "neutral";  // grey — factual, no emotion

/** A single memory entry with full Inside Out inspired schema. */
export interface Memory {
  id: string;
  content: string;
  tier: "M0" | "M30" | "M90" | "M365";
  emotions: EmotionTag[];
  intensity: number;                  // 0.0 ~ 1.0
  createdAt: number;                  // Unix ms
  expiresAt: number | null;           // null = never (M0)
  promotedFrom: string | null;        // ID of memory this was promoted from
  referenceCount: number;             // times referenced in conversation
  lastReferencedAt: number | null;
  personalityIsland: string | null;   // linked personality island ID
  source: "conversation" | "observation" | "distillation" | "user";
  // Backwards compat
  lastAccessed: number;
  accessCount?: number;
}

/** @deprecated Use Memory instead. Kept as alias for backwards compat. */
export type MemoryTier = Memory;

export interface MemoryStats {
  total: number;
  byTier: Record<string, number>;
  forgettingQueueSize?: number;
}

export interface MemoryAdapter {
  getMemories(tier?: string): Promise<Memory[]>;
  deleteMemory(id: string): Promise<boolean>;
  deleteAll(): Promise<boolean>;
  exportAll(): Promise<Memory[]>;
  getStats(): Promise<MemoryStats>;
}

// ---------- Forgetting Queue ----------

interface ForgettingEntry {
  memory: Memory;
  enteredAt: number;
  expiresAt: number;  // 7 days after entry
  reason: "expired" | "displaced" | "manual";
}

const FORGETTING_QUEUE_KEY = "companion_forgetting_queue";
const FORGETTING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------- Constants ----------

const OPENCLAW_BASE_URL = "http://localhost:18789";
const LOCAL_STORAGE_KEY = "companion_memories";

const DAY_MS = 24 * 60 * 60 * 1000;

/** TTL for each tier in milliseconds. M0 = null (never expires). */
const TIER_TTL: Record<string, number | null> = {
  M0: null,
  M30: 30 * DAY_MS,
  M90: 90 * DAY_MS,
  M365: 365 * DAY_MS,
};

/** Tier display labels for UI. */
export const TIER_LABELS: Record<string, string> = {
  M0: "M0 Core",
  M30: "M30 Short-term",
  M90: "M90 Mid-term",
  M365: "M365 Long-term",
};

/** Ordered tiers for display. */
export const TIER_ORDER: string[] = ["M0", "M30", "M90", "M365"];

// ---------- Emotion Detection ----------

/** Keyword-based emotion detection using locale strings. */
function getEmotionKeywords(): Record<EmotionTag, string[]> {
  const l = locale();
  return {
    joy: l.emotion_joy_keywords,
    sadness: l.emotion_sadness_keywords,
    anger: l.emotion_anger_keywords,
    fear: l.emotion_fear_keywords,
    disgust: l.emotion_disgust_keywords,
    anxiety: l.emotion_anxiety_keywords,
    envy: l.emotion_envy_keywords,
    ennui: l.emotion_ennui_keywords,
    nostalgia: l.emotion_nostalgia_keywords,
    neutral: [],
  };
}

/**
 * Detect emotions from text using keyword matching.
 * Returns the detected emotions and their intensity.
 */
export function detectEmotion(text: string): { emotions: EmotionTag[]; intensity: number } {
  const lower = text.toLowerCase();
  const hits: { tag: EmotionTag; count: number }[] = [];

  const emotionKeywords = getEmotionKeywords();
  for (const [tag, keywords] of Object.entries(emotionKeywords) as [EmotionTag, string[]][]) {
    if (tag === "neutral") continue;
    let count = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) count++;
    }
    if (count > 0) hits.push({ tag, count });
  }

  if (hits.length === 0) {
    return { emotions: ["neutral"], intensity: 0.1 };
  }

  // Sort by hit count descending
  hits.sort((a, b) => b.count - a.count);

  // Top emotions (max 3)
  const emotions = hits.slice(0, 3).map((h) => h.tag);

  // Intensity based on total keyword matches (capped at 1.0)
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);
  const intensity = Math.min(1.0, 0.3 + totalHits * 0.15);

  return { emotions, intensity };
}

// ---------- Migration ----------

/**
 * Migrate old-format memory entries to the new schema.
 * Fills in default values for new fields.
 */
function migrateMemory(raw: Record<string, unknown>): Memory {
  const m = raw as Partial<Memory>;
  const now = Date.now();
  const tier = (m.tier ?? "M30") as Memory["tier"];
  const createdAt = m.createdAt ?? now;

  // Calculate expiresAt based on tier TTL
  const ttl = TIER_TTL[tier];
  const expiresAt = m.expiresAt !== undefined ? m.expiresAt : (ttl ? createdAt + ttl : null);

  return {
    id: m.id ?? `local-${now}-${Math.random().toString(36).slice(2, 9)}`,
    content: m.content ?? "",
    tier,
    emotions: m.emotions ?? ["neutral"],
    intensity: m.intensity ?? 0.1,
    createdAt,
    expiresAt,
    promotedFrom: m.promotedFrom ?? null,
    referenceCount: m.referenceCount ?? (m.accessCount ?? 0),
    lastReferencedAt: m.lastReferencedAt ?? (m.lastAccessed ?? null),
    personalityIsland: m.personalityIsland ?? null,
    source: m.source ?? "user",
    lastAccessed: m.lastAccessed ?? now,
    accessCount: m.accessCount ?? 0,
  };
}

// ---------- OpenClaw Memory Adapter ----------

export class OpenClawMemoryAdapter implements MemoryAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl = OPENCLAW_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async getMemories(tier?: string): Promise<Memory[]> {
    try {
      const url = tier
        ? `${this.baseUrl}/api/memory?tier=${encodeURIComponent(tier)}`
        : `${this.baseUrl}/api/memory`;

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return [];
      const data = (await res.json()) as { memories?: Record<string, unknown>[] };
      return Array.isArray(data.memories) ? data.memories.map((m) => migrateMemory(m)) : [];
    } catch {
      return [];
    }
  }

  async deleteMemory(id: string): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/memory/${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000) },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async deleteAll(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/memory`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async exportAll(): Promise<Memory[]> {
    return this.getMemories();
  }

  async getStats(): Promise<MemoryStats> {
    try {
      const res = await fetch(`${this.baseUrl}/api/memory/stats`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return this.computeStats();
      const data = (await res.json()) as MemoryStats;
      if (typeof data.total === "number" && data.byTier) return data;
      return this.computeStats();
    } catch {
      return this.computeStats();
    }
  }

  private async computeStats(): Promise<MemoryStats> {
    const memories = await this.getMemories();
    return buildStats(memories);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/memory`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }
}

// ---------- Local Memory Adapter ----------

class LocalMemoryAdapter implements MemoryAdapter {
  private readonly storageKey: string;

  constructor(storageKey = LOCAL_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async getMemories(tier?: string): Promise<Memory[]> {
    const memories = this.load();
    if (tier) return memories.filter((m) => m.tier === tier);
    return memories;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const memories = this.load();
    const filtered = memories.filter((m) => m.id !== id);
    if (filtered.length === memories.length) return false;
    this.save(filtered);
    return true;
  }

  async deleteAll(): Promise<boolean> {
    this.save([]);
    return true;
  }

  async exportAll(): Promise<Memory[]> {
    return this.load();
  }

  async getStats(): Promise<MemoryStats> {
    const stats = buildStats(this.load());
    stats.forgettingQueueSize = loadForgettingQueue().length;
    return stats;
  }

  /** Add a memory with full schema support. */
  addMemory(
    content: string,
    tier: Memory["tier"] = "M30",
    options?: {
      emotions?: EmotionTag[];
      intensity?: number;
      source?: Memory["source"];
      personalityIsland?: string;
    },
  ): Memory {
    const memories = this.load();
    const now = Date.now();
    const ttl = TIER_TTL[tier];

    // Auto-detect emotion if not provided
    const detected = options?.emotions ? null : detectEmotion(content);

    const memory: Memory = {
      id: `local-${now}-${Math.random().toString(36).slice(2, 9)}`,
      tier,
      content,
      emotions: options?.emotions ?? detected?.emotions ?? ["neutral"],
      intensity: options?.intensity ?? detected?.intensity ?? 0.1,
      createdAt: now,
      expiresAt: ttl ? now + ttl : null,
      promotedFrom: null,
      referenceCount: 0,
      lastReferencedAt: null,
      personalityIsland: options?.personalityIsland ?? null,
      source: options?.source ?? "conversation",
      lastAccessed: now,
      accessCount: 0,
    };

    memories.push(memory);
    this.save(memories);
    return memory;
  }

  /** Move expired memories to the forgetting queue instead of deleting. */
  processExpirations(): { expired: number; purged: number } {
    const memories = this.load();
    const now = Date.now();
    const active: Memory[] = [];
    const queue = loadForgettingQueue();
    let expired = 0;

    for (const mem of memories) {
      if (mem.expiresAt !== null && mem.expiresAt <= now) {
        // Move to forgetting queue (Bing Bong gets 7 more days)
        queue.push({
          memory: mem,
          enteredAt: now,
          expiresAt: now + FORGETTING_RETENTION_MS,
          reason: "expired",
        });
        expired++;
        log.info(`[Memory] Expired: "${mem.content.slice(0, 40)}..." (${mem.tier}) -> forgetting queue`);
      } else {
        active.push(mem);
      }
    }

    // Purge memories that have been in the forgetting queue too long
    const surviving: ForgettingEntry[] = [];
    let purged = 0;
    for (const entry of queue) {
      if (entry.expiresAt <= now) {
        purged++;
        log.info(`[Memory] Purged from forgetting queue: "${entry.memory.content.slice(0, 40)}..."`);
      } else {
        surviving.push(entry);
      }
    }

    if (expired > 0) this.save(active);
    saveForgettingQueue(surviving);

    return { expired, purged };
  }

  load(): Memory[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>[];
        return parsed.map(migrateMemory);
      }
    } catch {
      // Corrupted data — return empty
    }
    return [];
  }

  save(memories: Memory[]): void {
    try {
      const json = JSON.stringify(memories);
      localStorage.setItem(this.storageKey, json);
      persistToDisk("memories", json);
    } catch (err) {
      log.error("[LocalMemoryAdapter] Failed to save memories:", err);
    }
  }
}

// ---------- Forgetting Queue Helpers ----------

function loadForgettingQueue(): ForgettingEntry[] {
  try {
    const raw = localStorage.getItem(FORGETTING_QUEUE_KEY);
    if (raw) return JSON.parse(raw) as ForgettingEntry[];
  } catch { /* corrupted */ }
  return [];
}

function saveForgettingQueue(queue: ForgettingEntry[]): void {
  try {
    const json = JSON.stringify(queue);
    localStorage.setItem(FORGETTING_QUEUE_KEY, json);
    persistToDisk("forgetting_queue", json);
  } catch (err) {
    log.error("[MemoryManager] Failed to save forgetting queue:", err);
  }
}

// ---------- Helpers ----------

function buildStats(memories: Memory[]): MemoryStats {
  const byTier: Record<string, number> = {};
  for (const m of memories) {
    byTier[m.tier] = (byTier[m.tier] ?? 0) + 1;
  }
  return { total: memories.length, byTier };
}

/**
 * Compute temporal spread of a memory in days.
 * Spread = (lastReferencedAt - createdAt) in days.
 * Returns 0 if never referenced.
 */
function computeTemporalSpread(mem: Memory): number {
  if (!mem.lastReferencedAt) return 0;
  return (mem.lastReferencedAt - mem.createdAt) / DAY_MS;
}

function formatRelativeTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

// ---------- Memory Manager ----------

export class MemoryManager {
  private localAdapter: LocalMemoryAdapter;
  private activeAdapter: MemoryAdapter;
  private isOpenClawAvailable = false;
  private blacklistChecker: ((content: string) => boolean) | null = null;

  constructor() {
    this.localAdapter = new LocalMemoryAdapter();
    this.activeAdapter = this.localAdapter;
  }

  async initialize(): Promise<void> {
    this.isOpenClawAvailable = false;
    this.activeAdapter = this.localAdapter;

    // Seed localStorage from disk if needed (cache-clear recovery / first-run migration)
    await this.seedFromDisk();

    // Run expiration check on init
    const result = this.localAdapter.processExpirations();
    if (result.expired > 0 || result.purged > 0) {
      log.info(`[MemoryManager] Expiration check: ${result.expired} expired, ${result.purged} purged`);
    }
  }

  /**
   * Seed localStorage from disk backup on startup.
   *
   * - disk exists, localStorage empty → restore from disk (cache-clear recovery)
   * - disk missing, localStorage exists → migrate localStorage to disk (first deploy)
   * - both exist → keep localStorage as-is (normal state)
   */
  private async seedFromDisk(): Promise<void> {
    try {
      await this.seedKey(LOCAL_STORAGE_KEY, "memories");
      await this.seedKey(FORGETTING_QUEUE_KEY, "forgetting_queue");
    } catch (err) {
      log.error("[MemoryManager] Disk seeding failed:", err);
    }
  }

  private async seedKey(localKey: string, diskKey: string): Promise<void> {
    const diskData = await loadFromDisk(diskKey);
    const localData = localStorage.getItem(localKey);

    if (diskData && !localData) {
      // Restore from disk (WebView cache was cleared)
      localStorage.setItem(localKey, diskData);
      log.info(`[MemoryManager] Restored ${diskKey} from disk to localStorage`);
    } else if (!diskData && localData) {
      // First deploy: migrate existing localStorage to disk
      persistToDisk(diskKey, localData);
      log.info(`[MemoryManager] Migrated ${diskKey} from localStorage to disk`);
    }
  }

  setBlacklistChecker(checker: (content: string) => boolean): void {
    this.blacklistChecker = checker;
  }

  isUsingOpenClaw(): boolean {
    return this.isOpenClawAvailable;
  }

  async getMemories(tier?: string): Promise<Memory[]> {
    const memories = await this.activeAdapter.getMemories(tier);
    return this.filterBlacklisted(memories);
  }

  async deleteMemory(id: string): Promise<boolean> {
    return this.activeAdapter.deleteMemory(id);
  }

  /**
   * Move a memory to the forgetting queue instead of hard-deleting.
   * For M0 memories, requires explicit force flag.
   */
  async softDeleteMemory(id: string, force = false): Promise<boolean> {
    const memories = this.localAdapter.load();
    const mem = memories.find((m) => m.id === id);
    if (!mem) return false;

    if (mem.tier === "M0" && !force) {
      log.warn("[MemoryManager] Cannot soft-delete M0 memory without force flag");
      return false;
    }

    const queue = loadForgettingQueue();
    queue.push({
      memory: mem,
      enteredAt: Date.now(),
      expiresAt: Date.now() + FORGETTING_RETENTION_MS,
      reason: "manual",
    });
    saveForgettingQueue(queue);

    return this.activeAdapter.deleteMemory(id);
  }

  async deleteAll(): Promise<boolean> {
    return this.activeAdapter.deleteAll();
  }

  async exportAll(): Promise<Memory[]> {
    const memories = await this.activeAdapter.exportAll();
    return this.filterBlacklisted(memories);
  }

  async getStats(): Promise<MemoryStats> {
    return this.activeAdapter.getStats();
  }

  /**
   * Track a piece of companion knowledge with full emotion tagging.
   */
  trackKnowledge(
    content: string,
    tier: Memory["tier"] = "M30",
    options?: {
      emotions?: EmotionTag[];
      intensity?: number;
      source?: Memory["source"];
      personalityIsland?: string;
    },
  ): Memory {
    return this.localAdapter.addMemory(content, tier, options);
  }

  /**
   * Build a context string from the most relevant memories for chat injection.
   * Budget: 1500 chars max. Priority: M0 > M365 > M90 > M30.
   */
  async getContextForChat(): Promise<string> {
    const allMemories = await this.getMemories();
    if (allMemories.length === 0) return "";

    const tierPriority: Record<string, number> = { M0: 0, M365: 1, M90: 2, M30: 3 };
    const sorted = [...allMemories].sort((a, b) => {
      const tierDiff = (tierPriority[a.tier] ?? 9) - (tierPriority[b.tier] ?? 9);
      if (tierDiff !== 0) return tierDiff;
      return b.lastAccessed - a.lastAccessed;
    });

    const BUDGET = 1500;
    const lines: string[] = [];
    let totalLen = 0;
    const selectedIds: string[] = [];

    for (const mem of sorted) {
      const age = Date.now() - mem.createdAt;
      const relative = formatRelativeTime(age);
      const emotionLabel = mem.emotions.filter((e) => e !== "neutral").join("+") || "";
      const line = emotionLabel
        ? `- [${emotionLabel}] ${mem.content} (${relative})`
        : `- ${mem.content} (${relative})`;
      if (totalLen + line.length > BUDGET) break;
      lines.push(line);
      totalLen += line.length;
      selectedIds.push(mem.id);
    }

    if (selectedIds.length > 0) {
      this.incrementReferenceCounts(selectedIds);
    }

    return lines.join("\n");
  }

  /**
   * Run the memory promotion pipeline with LLM distillation.
   *
   * M30→M90:
   *   Base: age >= 7d AND (referenceCount >= 3 OR intensity > 0.7 OR in topic cluster)
   *   Flashbulb: intensity >= 0.95 waives age; intensity >= 0.85 halves age to 3.5d
   *   Temporal spread: lastReferencedAt - createdAt >= 3 days also qualifies
   *
   * M90→M365:
   *   Base: age >= 30d AND (refs >= 5 OR personalityIsland OR high-emotion)
   *   Flashbulb: intensity >= 0.95 waives age; intensity >= 0.85 halves age to 15d
   *   Temporal spread: lastReferencedAt - createdAt >= 14 days also qualifies
   *
   * M365→M0 (auto, in-place — no distillation since M365 is already distilled):
   *   age >= 180d AND (refs >= 10 OR personalityIsland linked OR (intensity >= 0.9 + 3 emotions))
   *   Safety cap: max 1 per run; candidates sorted by age descending (oldest first)
   */
  async runPromotionPipeline(): Promise<{
    promoted: Array<{ id: string; from: string; to: string }>;
    newM0: Memory[];
  }> {
    const memories = this.localAdapter.load();
    const now = Date.now();
    const promoted: Array<{ id: string; from: string; to: string }> = [];
    const newM0: Memory[] = [];

    // Build topic clusters for M30 memories to enable cluster-based promotion
    const m30Memories = memories.filter((m) => m.tier === "M30");
    const clusters = this.findTopicClusters(m30Memories);
    const clusterPromotionIds = new Set<string>();
    for (const cluster of clusters) {
      for (const mem of cluster) {
        clusterPromotionIds.add(mem.id);
      }
    }

    let m0PromotedCount = 0;
    let distillationFailures = 0;

    // Sort M365 candidates by age descending so the oldest promote first
    // when the safety cap allows only 1 per run.
    const sortedMemories = [...memories].sort((a, b) => {
      if (a.tier === "M365" && b.tier === "M365") return a.createdAt - b.createdAt;
      return 0;
    });

    for (const mem of sortedMemories) {
      const ageDays = (now - mem.createdAt) / DAY_MS;
      const refs = mem.referenceCount;
      const spread = computeTemporalSpread(mem);

      // ---- M30 → M90 ----
      if (mem.tier === "M30") {
        const baseAgeReq = 7; // days
        const ageReq = mem.intensity >= FLASHBULB_EXTREME_THRESHOLD ? 0
          : mem.intensity >= FLASHBULB_MILD_THRESHOLD ? baseAgeReq / 2
          : baseAgeReq;

        const meetsAge = ageDays >= ageReq;
        const meetsQuality = refs >= 3 || mem.intensity > 0.7 || clusterPromotionIds.has(mem.id);
        const meetsSpread = spread >= SPREAD_M30_TO_M90_DAYS;

        if (meetsAge && (meetsQuality || meetsSpread)) {
          const targetTier = "M90" as const;
          const distilled = await this.promoteWithDistillation(mem, memories, targetTier, now);
          if (!distilled) distillationFailures++;
          promoted.push({ id: mem.id, from: "M30", to: targetTier });
        }
        continue;
      }

      // ---- M90 → M365 ----
      if (mem.tier === "M90") {
        const baseAgeReq = 30; // days
        const ageReq = mem.intensity >= FLASHBULB_EXTREME_THRESHOLD ? 0
          : mem.intensity >= FLASHBULB_MILD_THRESHOLD ? baseAgeReq / 2
          : baseAgeReq;

        const meetsAge = ageDays >= ageReq;
        const meetsQuality = refs >= 5 || mem.personalityIsland !== null ||
          (mem.intensity > 0.8 && mem.emotions.filter((e) => e !== "neutral").length >= 2);
        const meetsSpread = spread >= SPREAD_M90_TO_M365_DAYS;

        if (meetsAge && (meetsQuality || meetsSpread)) {
          const targetTier = "M365" as const;
          const distilled = await this.promoteWithDistillation(mem, memories, targetTier, now);
          if (!distilled) distillationFailures++;
          promoted.push({ id: mem.id, from: "M90", to: targetTier });
        }
        continue;
      }

      // ---- M365 → M0 (auto, in-place, no distillation) ----
      // M365 memories have already been distilled during M90→M365 promotion,
      // so we promote to M0 in-place to preserve the distilled content as-is.
      if (mem.tier === "M365" && m0PromotedCount < M0_AUTO_PROMOTE_MAX_PER_RUN) {
        const meetsAge = ageDays >= M0_AUTO_PROMOTE_MIN_AGE_DAYS;
        const meetsRefs = refs >= M0_AUTO_PROMOTE_MIN_REFS;
        const meetsIsland = mem.personalityIsland !== null;
        const meetsHighEmotion = mem.intensity >= 0.9 &&
          mem.emotions.filter((e) => e !== "neutral").length >= 3;

        if (meetsAge && (meetsRefs || meetsIsland || meetsHighEmotion)) {
          log.info(`[Memory] Auto-promoting M365->M0: "${mem.content.slice(0, 40)}..."`);
          mem.tier = "M0";
          mem.expiresAt = null;
          promoted.push({ id: mem.id, from: "M365", to: "M0" });
          newM0.push(mem);
          m0PromotedCount++;
        }
      }
    }

    if (promoted.length > 0) {
      this.localAdapter.save(memories);
    }

    if (distillationFailures > 0) {
      log.warn(`[Memory] Distillation failed for ${distillationFailures} promotion(s) this run — memories promoted without compression`);
    }

    return { promoted, newM0 };
  }

  /**
   * Promote a memory with LLM distillation attempt.
   * Returns true if distillation succeeded, false if it failed (memory still promoted raw).
   */
  private async promoteWithDistillation(
    mem: Memory,
    allMemories: Memory[],
    targetTier: "M90" | "M365",
    now: number,
  ): Promise<boolean> {
    const related = this.findRelatedMemories(mem, allMemories);
    const distillResult = await distillMemories([mem, ...related], targetTier);

    if (distillResult) {
      log.info(`[Memory] Distilling ${mem.tier}->${targetTier}: "${mem.content.slice(0, 40)}..." -> "${distillResult.distilledContent.slice(0, 40)}..."`);
      this.localAdapter.addMemory(distillResult.distilledContent, targetTier, {
        emotions: distillResult.emotions,
        intensity: distillResult.intensity,
        source: "distillation",
      });
      mem.tier = targetTier;
      mem.expiresAt = now + (TIER_TTL[targetTier] as number);
      mem.promotedFrom = mem.id;
      return true;
    } else {
      log.info(`[Memory] Promoting ${mem.tier}->${targetTier} (no distillation): "${mem.content.slice(0, 40)}..."`);
      mem.tier = targetTier;
      mem.expiresAt = now + (TIER_TTL[targetTier] as number);
      return false;
    }
  }

  /**
   * Run expiration check: move expired memories to forgetting queue,
   * purge old entries from forgetting queue.
   */
  runExpirationCheck(): { expired: number; purged: number } {
    return this.localAdapter.processExpirations();
  }

  // ---------- Pin / Conversation Signal API ----------

  /**
   * Pin a memory ("기억해") — immediately promotes to next tier with distillation.
   * Called by conversation signal detection.
   */
  async pinMemory(id: string): Promise<{ from: string; to: string } | null> {
    const memories = this.localAdapter.load();
    const mem = memories.find((m) => m.id === id);
    if (!mem) return null;

    const now = Date.now();
    const tierOrder: Memory["tier"][] = ["M30", "M90", "M365", "M0"];
    const currentIdx = tierOrder.indexOf(mem.tier);
    if (currentIdx === -1 || currentIdx >= tierOrder.length - 1) return null; // Already M0 or unknown

    const nextTier = tierOrder[currentIdx + 1];
    const related = this.findRelatedMemories(mem, memories);
    const distillResult = await distillMemories([mem, ...related], nextTier);

    if (distillResult) {
      log.info(`[Memory] Pin+Distill ${mem.tier}->${nextTier}: "${mem.content.slice(0, 40)}..." -> "${distillResult.distilledContent.slice(0, 40)}..."`);
      this.localAdapter.addMemory(distillResult.distilledContent, nextTier, {
        emotions: distillResult.emotions,
        intensity: distillResult.intensity,
        source: "distillation",
      });
    }

    const from = mem.tier;
    mem.tier = nextTier;
    const ttl = TIER_TTL[nextTier];
    mem.expiresAt = ttl ? now + ttl : null;
    this.localAdapter.save(memories);

    return { from, to: nextTier };
  }

  /**
   * Get the most recently created conversation memory.
   * Used by "forget" signal to find what to soft-delete.
   */
  getLastConversationMemory(): Memory | null {
    const memories = this.localAdapter.load();
    const conversations = memories
      .filter((m) => m.source === "conversation")
      .sort((a, b) => b.createdAt - a.createdAt);
    return conversations[0] ?? null;
  }

  // ---------- Forgetting Queue API ----------

  /** Get all memories in the forgetting queue (망각의 절벽). */
  getForgettingQueue(): ForgettingEntry[] {
    return loadForgettingQueue();
  }

  /** Restore a memory from the forgetting queue back to active memories. */
  restoreFromForgettingQueue(memoryId: string): boolean {
    const queue = loadForgettingQueue();
    const idx = queue.findIndex((e) => e.memory.id === memoryId);
    if (idx === -1) return false;

    const entry = queue[idx];
    const now = Date.now();

    // Restore with fresh TTL
    const ttl = TIER_TTL[entry.memory.tier];
    const restored: Memory = {
      ...entry.memory,
      expiresAt: ttl ? now + ttl : null,
      lastAccessed: now,
    };

    const memories = this.localAdapter.load();
    memories.push(restored);
    this.localAdapter.save(memories);

    // Remove from queue
    queue.splice(idx, 1);
    saveForgettingQueue(queue);

    log.info(`[Memory] Restored from forgetting queue: "${restored.content.slice(0, 40)}..."`);
    return true;
  }

  // ---------- Internal ----------

  private incrementReferenceCounts(ids: string[]): void {
    const memories = this.localAdapter.load();
    const idSet = new Set(ids);
    const now = Date.now();

    for (const mem of memories) {
      if (idSet.has(mem.id)) {
        mem.referenceCount = (mem.referenceCount ?? 0) + 1;
        mem.lastReferencedAt = now;
        mem.accessCount = (mem.accessCount ?? 0) + 1;
        mem.lastAccessed = now;
      }
    }

    this.localAdapter.save(memories);
  }

  private filterBlacklisted(memories: Memory[]): Memory[] {
    if (!this.blacklistChecker) return memories;
    const checker = this.blacklistChecker;
    return memories.filter((m) => !checker(m.content));
  }

  /**
   * Find memories related to the target by keyword overlap.
   * Returns memories sharing 2+ significant tokens (>2 chars, excluding stopwords).
   */
  private findRelatedMemories(target: Memory, allMemories: Memory[]): Memory[] {
    const targetTokens = this.extractKeywords(target.content);
    if (targetTokens.size === 0) return [];

    const related: Memory[] = [];
    for (const mem of allMemories) {
      if (mem.id === target.id) continue;
      if (mem.tier !== target.tier) continue;

      const tokens = this.extractKeywords(mem.content);
      let overlap = 0;
      for (const t of tokens) {
        if (targetTokens.has(t)) overlap++;
      }
      if (overlap >= TOPIC_CLUSTER_MIN_OVERLAP) {
        related.push(mem);
      }
    }
    return related.slice(0, 5);
  }

  /**
   * Find topic clusters among memories based on keyword overlap.
   * Returns groups of 3+ memories sharing significant keywords.
   */
  private findTopicClusters(memories: Memory[]): Memory[][] {
    if (memories.length < TOPIC_CLUSTER_MIN_SIZE) return [];

    // Build keyword sets for each memory
    const keywordSets = memories.map((m) => ({
      memory: m,
      keywords: this.extractKeywords(m.content),
    }));

    // Union-Find style clustering
    const clusters: Map<string, Memory[]> = new Map();
    const assigned = new Set<string>();

    for (let i = 0; i < keywordSets.length; i++) {
      if (assigned.has(keywordSets[i].memory.id)) continue;

      const cluster: Memory[] = [keywordSets[i].memory];
      assigned.add(keywordSets[i].memory.id);

      for (let j = i + 1; j < keywordSets.length; j++) {
        if (assigned.has(keywordSets[j].memory.id)) continue;

        let overlap = 0;
        for (const kw of keywordSets[j].keywords) {
          if (keywordSets[i].keywords.has(kw)) overlap++;
        }

        if (overlap >= TOPIC_CLUSTER_MIN_OVERLAP) {
          cluster.push(keywordSets[j].memory);
          assigned.add(keywordSets[j].memory.id);
        }
      }

      if (cluster.length >= TOPIC_CLUSTER_MIN_SIZE) {
        clusters.set(keywordSets[i].memory.id, cluster);
      }
    }

    return Array.from(clusters.values());
  }

  /** Extract significant keywords from content (>2 chars, lowercased). */
  private extractKeywords(content: string): Set<string> {
    const stopwords = new Set(locale().stopwords);
    const tokens = content.toLowerCase().split(/[\s,.!?;:'"()\[\]{}<>\/\\|@#$%^&*+=~`]+/);
    const keywords = new Set<string>();
    for (const t of tokens) {
      if (t.length > 2 && !stopwords.has(t)) {
        keywords.add(t);
      }
    }
    return keywords;
  }
}
