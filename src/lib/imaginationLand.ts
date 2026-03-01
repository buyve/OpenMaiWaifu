/**
 * Imagination Land — Inside Out inspired proactive behavior system.
 *
 * Combines existing memories with current context to generate
 * proactive character actions (suggestions, comments, reactions).
 * The character "imagines" scenarios based on what it knows.
 */

import type { Memory, EmotionTag } from "./memoryManager.ts";
import type { AppSession } from "../hooks/useScreenWatch.ts";
import { log } from "./logger.ts";
import { generateImagination } from "./llmService.ts";
import { locale } from "./i18n";

// ---------- Types ----------

export interface Imagination {
  id: string;
  /** What triggered the imagination. */
  trigger: string;
  /** Memory IDs used to form this imagination. */
  memoriesUsed: string[];
  /** The generated scenario / suggestion. */
  scenario: string;
  /** Suggested character action (speech bubble text). */
  action: string;
  /** Emotion to display. */
  emotion: EmotionTag;
  /** When this was imagined. */
  createdAt: number;
  /** Whether the user responded positively. */
  feedback: "positive" | "negative" | "ignored" | null;
}

export interface ImaginationConfig {
  /** Maximum imaginations per day. */
  dailyLimit: number;
  /** Minimum minutes between imaginations. */
  cooldownMinutes: number;
  /** Whether imagination is enabled. */
  enabled: boolean;
}

// ---------- Constants ----------

const STORAGE_KEY = "companion_imaginations";
const CONFIG_KEY = "companion_imagination_config";

const DEFAULT_CONFIG: ImaginationConfig = {
  dailyLimit: 3,
  cooldownMinutes: 60,
  enabled: true,
};

// ---------- Imagination Templates ----------

/**
 * Template-based imagination rules.
 * Each template matches a combination of memory patterns + context,
 * and generates a scenario/action.
 *
 * In the future, these can be replaced with LLM-generated scenarios.
 */
interface ImaginationTemplate {
  id: string;
  /** Check if memories + context match this template. */
  match: (memories: Memory[], context: ImaginationContext) => boolean;
  /** Generate the action text. */
  generate: (memories: Memory[], context: ImaginationContext) => { action: string; emotion: EmotionTag; scenario: string };
}

export interface ImaginationContext {
  currentApp: AppSession | null;
  hour: number;
  dayOfWeek: number;  // 0=Sun, 6=Sat
  isIdle: boolean;    // No app change for > 5 min
}

function getTemplates(): ImaginationTemplate[] {
  const l = locale();
  return [
    {
      id: "late_work_care",
      match: (_mem, ctx) => ctx.hour >= 20 && ctx.currentApp !== null && !ctx.isIdle,
      generate: (_mem, ctx) => ({
        action: l.imagination_late_work(ctx.hour >= 22),
        emotion: "sadness" as EmotionTag,
        scenario: "User is working late, character shows concern",
      }),
    },
    {
      id: "morning_greeting",
      match: (_mem, ctx) => ctx.hour >= 7 && ctx.hour <= 9 && ctx.isIdle,
      generate: () => ({
        action: l.imagination_morning,
        emotion: "joy" as EmotionTag,
        scenario: "Morning greeting with tsundere flavor",
      }),
    },
    {
      id: "weekend_idle",
      match: (_mem, ctx) => (ctx.dayOfWeek === 0 || ctx.dayOfWeek === 6) && ctx.isIdle && ctx.hour >= 10 && ctx.hour <= 18,
      generate: () => ({
        action: l.imagination_weekend,
        emotion: "ennui" as EmotionTag,
        scenario: "Weekend idle, character is bored",
      }),
    },
    {
      id: "coding_encourage",
      match: (_mem, ctx) => {
        if (!ctx.currentApp) return false;
        const app = ctx.currentApp.appName.toLowerCase();
        return (app.includes("code") || app.includes("cursor") || app.includes("xcode")) && ctx.currentApp.duration > 3600;
      },
      generate: (_mem, ctx) => ({
        action: l.imagination_coding(Math.floor((ctx.currentApp?.duration ?? 0) / 3600)),
        emotion: "anxiety" as EmotionTag,
        scenario: "Long coding session, mixed admiration and concern",
      }),
    },
    {
      id: "memory_recall",
      match: (mem) => mem.length > 0 && Math.random() < 0.3,
      generate: (mem) => {
        const randomMem = mem[Math.floor(Math.random() * mem.length)];
        return {
          action: l.imagination_memory_recall(randomMem.content.slice(0, 30)),
          emotion: "nostalgia" as EmotionTag,
          scenario: `Recalling memory: ${randomMem.content.slice(0, 50)}`,
        };
      },
    },
  ];
}

// ---------- Imagination Engine ----------

export class ImaginationEngine {
  private config: ImaginationConfig;
  private history: Imagination[];
  private todayCount = 0;
  private lastImagination = 0;

  constructor() {
    this.config = this.loadConfig();
    this.history = this.loadHistory();
    this.resetDailyCountIfNeeded();
  }

  // ---------- Public API ----------

  /**
   * Try to generate an imagination based on current context and memories.
   * LLM-first, template-fallback.
   * Returns null if conditions aren't met (cooldown, daily limit, etc.).
   */
  async imagine(memories: Memory[], context: ImaginationContext): Promise<Imagination | null> {
    if (!this.config.enabled) return null;

    // Check daily limit
    this.resetDailyCountIfNeeded();
    if (this.todayCount >= this.config.dailyLimit) return null;

    // Check cooldown
    const now = Date.now();
    if (now - this.lastImagination < this.config.cooldownMinutes * 60 * 1000) return null;

    // Get recent actions for LLM context (avoid repeating)
    const recentActions = this.history.slice(-3).map((h) => h.action);

    // Day-of-week names for LLM context
    const dayNames = locale().imagination_day_names;

    // Try LLM first
    const llmResult = await generateImagination(
      memories.slice(0, 5),
      {
        hour: context.hour,
        dayOfWeek: dayNames[context.dayOfWeek],
        currentApp: context.currentApp?.appName ?? null,
        isIdle: context.isIdle,
      },
      recentActions,
    );

    if (llmResult) {
      return this.createImagination("llm", memories, llmResult, now);
    }

    // Fallback: try each template
    for (const template of getTemplates()) {
      if (template.match(memories, context)) {
        const result = template.generate(memories, context);
        return this.createImagination(template.id, memories, result, now);
      }
    }

    return null;
  }

  /** Create an Imagination entry, update history/counts, and save. */
  private createImagination(
    trigger: string,
    memories: Memory[],
    result: { action: string; emotion: EmotionTag; scenario: string },
    now: number,
  ): Imagination {
    const imagination: Imagination = {
      id: `img-${now}-${Math.random().toString(36).slice(2, 7)}`,
      trigger,
      memoriesUsed: memories.slice(0, 5).map((m) => m.id),
      scenario: result.scenario,
      action: result.action,
      emotion: result.emotion,
      createdAt: now,
      feedback: null,
    };

    this.history.push(imagination);
    this.todayCount++;
    this.lastImagination = now;
    this.saveHistory();

    log.info(`[Imagination] Generated: "${result.action}" (trigger: ${trigger})`);
    return imagination;
  }

  /** Record user feedback on an imagination. */
  recordFeedback(imaginationId: string, feedback: "positive" | "negative" | "ignored"): void {
    const img = this.history.find((i) => i.id === imaginationId);
    if (img) {
      img.feedback = feedback;
      this.saveHistory();
    }
  }

  /** Get imagination history (last 30 days). */
  getHistory(): Imagination[] {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return this.history.filter((i) => i.createdAt > cutoff);
  }

  /** Get positive feedback ratio (for template refinement). */
  getFeedbackStats(): { total: number; positive: number; negative: number; ignored: number } {
    const recent = this.getHistory();
    return {
      total: recent.length,
      positive: recent.filter((i) => i.feedback === "positive").length,
      negative: recent.filter((i) => i.feedback === "negative").length,
      ignored: recent.filter((i) => i.feedback === "ignored" || i.feedback === null).length,
    };
  }

  /** Update configuration. */
  setConfig(partial: Partial<ImaginationConfig>): void {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }

  /** Get current configuration. */
  getConfig(): ImaginationConfig {
    return { ...this.config };
  }

  // ---------- Internal ----------

  private resetDailyCountIfNeeded(): void {
    const today = new Date().toDateString();
    const lastDate = this.history.length > 0
      ? new Date(this.history[this.history.length - 1].createdAt).toDateString()
      : "";
    if (today !== lastDate) {
      this.todayCount = 0;
    } else {
      this.todayCount = this.history.filter(
        (i) => new Date(i.createdAt).toDateString() === today,
      ).length;
    }
  }

  private loadConfig(): ImaginationConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch { /* corrupted */ }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    } catch { /* full */ }
  }

  private loadHistory(): Imagination[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Imagination[];
        // Keep only last 30 days
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return parsed.filter((i) => i.createdAt > cutoff);
      }
    } catch { /* corrupted */ }
    return [];
  }

  private saveHistory(): void {
    try {
      // Keep only last 30 days
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = this.history.filter((i) => i.createdAt > cutoff);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch { /* full */ }
  }
}
