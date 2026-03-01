/**
 * Sense of Self — Inside Out 2 inspired belief system.
 *
 * Core memories and personality islands form beliefs:
 * "I am ___" statements that define the character's identity.
 *
 * Beliefs are formed from M0 memories, validated by the user,
 * and protected against rapid change (Anxiety prevention).
 */

import type { Memory } from "./memoryManager.ts";
import { extractBeliefs } from "./llmService.ts";
import { LLM_BELIEF_MIN_M0_COUNT } from "./constants.ts";
import { log } from "./logger.ts";
import { locale } from "./i18n";

// ---------- Types ----------

export interface Belief {
  id: string;
  /** "I am..." statement. */
  statement: string;
  /** 0.0 ~ 1.0 — how strongly this belief is held. */
  confidence: number;
  /** M0/M365 memory IDs that support this belief. */
  supportingMemories: string[];
  /** Linked personality island ID. */
  personalityIsland: string | null;
  formedAt: number;
  /** Whether the user has approved this belief. */
  userApproved: boolean;
}

export interface SenseOfSelf {
  beliefs: Belief[];
  lastUpdated: number;
  /** Incremented on each change for history tracking. */
  version: number;
  /** Change log entries. */
  changelog: ChangelogEntry[];
}

export interface ChangelogEntry {
  version: number;
  timestamp: number;
  action: "added" | "removed" | "confidence_changed" | "approved" | "rejected";
  beliefId: string;
  detail: string;
}

export interface SelfEvent {
  type: "belief_formed" | "belief_strengthened" | "belief_weakened" | "belief_removed" | "anxiety_blocked";
  belief: Belief;
  message: string;
}

// ---------- Constants ----------

const STORAGE_KEY = "companion_sense_of_self";

/**
 * Maximum percentage of beliefs that can change in a single session.
 * Prevents the "Anxiety takeover" (시온 사건).
 */
const MAX_CHANGE_RATIO = 0.3;

/** Maximum changelog entries to keep. */
const MAX_CHANGELOG = 100;

// ---------- Sense of Self Manager ----------

export class SenseOfSelfManager {
  private state: SenseOfSelf;
  /** Track how many beliefs changed this session (Anxiety prevention). */
  private sessionChanges = 0;

  constructor() {
    this.state = this.load();
  }

  // ---------- Public API ----------

  /** Get all beliefs. */
  getBeliefs(): Belief[] {
    return [...this.state.beliefs];
  }

  /** Get only user-approved beliefs. */
  getApprovedBeliefs(): Belief[] {
    return this.state.beliefs.filter((b) => b.userApproved);
  }

  /** Get the current version number. */
  getVersion(): number {
    return this.state.version;
  }

  /** Get the changelog. */
  getChangelog(): ChangelogEntry[] {
    return [...this.state.changelog];
  }

  /**
   * Propose a new belief formed from memories.
   * Does NOT auto-approve — requires user confirmation.
   */
  proposeBelief(
    statement: string,
    supportingMemories: string[],
    personalityIsland: string | null = null,
  ): SelfEvent | null {
    // Anxiety check: prevent too many changes in one session
    if (this.isAnxietyBlocked()) {
      return {
        type: "anxiety_blocked",
        belief: { id: "", statement, confidence: 0, supportingMemories, personalityIsland, formedAt: Date.now(), userApproved: false },
        message: locale().self_anxiety_blocked,
      };
    }

    // Check if a similar belief already exists
    const existing = this.state.beliefs.find((b) =>
      b.statement.toLowerCase() === statement.toLowerCase(),
    );
    if (existing) {
      return this.strengthenBelief(existing.id, supportingMemories);
    }

    const belief: Belief = {
      id: `belief-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      statement,
      confidence: 0.5,
      supportingMemories,
      personalityIsland,
      formedAt: Date.now(),
      userApproved: false,
    };

    this.state.beliefs.push(belief);
    this.sessionChanges++;
    this.addChangelog("added", belief.id, `Proposed: "${statement}"`);
    this.save();

    return {
      type: "belief_formed",
      belief,
      message: locale().self_belief_formed(statement),
    };
  }

  /**
   * User approves a proposed belief — it becomes part of the identity.
   */
  approveBelief(beliefId: string): SelfEvent | null {
    const belief = this.state.beliefs.find((b) => b.id === beliefId);
    if (!belief) return null;

    belief.userApproved = true;
    belief.confidence = Math.min(1.0, belief.confidence + 0.2);
    this.addChangelog("approved", beliefId, `Approved: "${belief.statement}"`);
    this.save();

    return {
      type: "belief_strengthened",
      belief,
      message: locale().self_belief_approved(belief.statement),
    };
  }

  /**
   * User rejects a proposed belief — confidence drops.
   * If confidence hits 0, the belief is removed.
   */
  rejectBelief(beliefId: string): SelfEvent | null {
    const belief = this.state.beliefs.find((b) => b.id === beliefId);
    if (!belief) return null;

    belief.confidence -= 0.3;
    this.addChangelog("rejected", beliefId, `Rejected: "${belief.statement}"`);

    if (belief.confidence <= 0) {
      this.state.beliefs = this.state.beliefs.filter((b) => b.id !== beliefId);
      this.addChangelog("removed", beliefId, `Removed (confidence 0): "${belief.statement}"`);
      this.save();

      return {
        type: "belief_removed",
        belief,
        message: locale().self_belief_rejected_removed(belief.statement),
      };
    }

    this.save();

    return {
      type: "belief_weakened",
      belief,
      message: locale().self_belief_rejected_weakened(belief.statement),
    };
  }

  /**
   * Strengthen an existing belief with new supporting memories.
   */
  strengthenBelief(beliefId: string, newMemoryIds: string[]): SelfEvent | null {
    const belief = this.state.beliefs.find((b) => b.id === beliefId);
    if (!belief) return null;

    for (const mid of newMemoryIds) {
      if (!belief.supportingMemories.includes(mid)) {
        belief.supportingMemories.push(mid);
      }
    }

    belief.confidence = Math.min(1.0, belief.confidence + 0.1);
    this.addChangelog("confidence_changed", beliefId, `Strengthened: "${belief.statement}" → ${belief.confidence.toFixed(2)}`);
    this.save();

    return {
      type: "belief_strengthened",
      belief,
      message: locale().self_belief_strengthened(belief.statement),
    };
  }

  /**
   * Weaken beliefs when a supporting memory is removed.
   */
  onMemoryRemoved(memoryId: string): SelfEvent[] {
    const events: SelfEvent[] = [];

    for (const belief of this.state.beliefs) {
      const idx = belief.supportingMemories.indexOf(memoryId);
      if (idx === -1) continue;

      belief.supportingMemories.splice(idx, 1);
      belief.confidence = Math.max(0, belief.confidence - 0.15);

      if (belief.confidence <= 0) {
        events.push({
          type: "belief_removed",
          belief,
          message: locale().self_memory_removed(belief.statement),
        });
      } else {
        events.push({
          type: "belief_weakened",
          belief,
          message: locale().self_memory_weakened(belief.statement, `${(belief.confidence * 100).toFixed(0)}%`),
        });
      }
    }

    // Remove beliefs with 0 confidence
    this.state.beliefs = this.state.beliefs.filter((b) => b.confidence > 0);

    if (events.length > 0) this.save();
    return events;
  }

  /**
   * Build a context string for LLM injection.
   */
  getContextForChat(): string {
    const approved = this.getApprovedBeliefs();
    if (approved.length === 0) return "";

    const lines = approved
      .sort((a, b) => b.confidence - a.confidence)
      .map((b) => `- "${b.statement}" (${(b.confidence * 100).toFixed(0)}%)`);

    return `[Sense of Self]\n${lines.join("\n")}`;
  }

  /**
   * Reset session change counter (call at session start).
   */
  resetSession(): void {
    this.sessionChanges = 0;
  }

  // ---------- LLM-powered belief extraction ----------

  /** Hash of M0 memories to detect changes. */
  private m0Hash = "";

  /**
   * Check if M0 memories have changed since last extraction.
   * Uses a hash of memory IDs + content.
   */
  hasM0Changed(m0Memories: Memory[]): boolean {
    const hash = m0Memories
      .map((m) => `${m.id}:${m.content.slice(0, 50)}`)
      .sort()
      .join("|");
    if (hash === this.m0Hash) return false;
    this.m0Hash = hash;
    return true;
  }

  /**
   * Auto-extract beliefs from M0 memories using LLM.
   * Calls proposeBelief() for each new belief found.
   * Returns SelfEvents for speech bubble display.
   */
  async autoExtractBeliefs(m0Memories: Memory[]): Promise<SelfEvent[]> {
    if (m0Memories.length < LLM_BELIEF_MIN_M0_COUNT) return [];

    const existingStatements = this.state.beliefs.map((b) => b.statement);
    const result = await extractBeliefs(m0Memories, existingStatements);
    if (!result || result.beliefs.length === 0) return [];

    const events: SelfEvent[] = [];
    for (const candidate of result.beliefs) {
      const event = this.proposeBelief(
        candidate.statement,
        candidate.memoryIds,
      );
      if (event) {
        log.info(`[SenseOfSelf] Auto-extracted belief: "${candidate.statement}"`);
        events.push(event);
      }
    }
    return events;
  }

  // ---------- Internal ----------

  /** Check if the Anxiety prevention threshold is hit. */
  private isAnxietyBlocked(): boolean {
    const totalBeliefs = this.state.beliefs.length;
    if (totalBeliefs === 0) return false;
    return this.sessionChanges / totalBeliefs > MAX_CHANGE_RATIO;
  }

  private addChangelog(action: ChangelogEntry["action"], beliefId: string, detail: string): void {
    this.state.version++;
    this.state.lastUpdated = Date.now();

    this.state.changelog.push({
      version: this.state.version,
      timestamp: Date.now(),
      action,
      beliefId,
      detail,
    });

    // Trim old entries
    if (this.state.changelog.length > MAX_CHANGELOG) {
      this.state.changelog = this.state.changelog.slice(-MAX_CHANGELOG);
    }
  }

  private load(): SenseOfSelf {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SenseOfSelf;
        if (parsed.beliefs && Array.isArray(parsed.beliefs)) return parsed;
      }
    } catch { /* corrupted */ }

    return {
      beliefs: [],
      lastUpdated: Date.now(),
      version: 0,
      changelog: [],
    };
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch { /* full */ }
  }
}
