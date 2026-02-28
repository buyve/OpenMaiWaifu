import type { AppSession } from "../hooks/useScreenWatch.ts";
import { log } from "./logger.ts";

// ---------- Types ----------

export interface CommentResult {
  /** The comment text to display in the speech bubble. */
  text: string;
  /** Emotion to apply to the character. */
  emotion: string;
  /** Whether the comment came from a rule or the LLM. */
  source: "rule" | "llm";
}

export interface CommentRule {
  /** Unique identifier for cooldown tracking. */
  id: string;
  /**
   * Returns true when this rule should fire.
   * @param session  - Current active app session.
   * @param history  - Recent app usage history.
   * @param currentHour - Hour of day (0-23).
   */
  condition: (
    session: AppSession,
    history: AppSession[],
    currentHour: number,
  ) => boolean;
  /** Pool of messages — one is picked at random. */
  messages: string[];
  /** Emotion to apply when this rule fires. */
  emotion: string;
  /** Minimum minutes between firings of this rule. */
  cooldownMinutes: number;
}

// ---------- App classification helpers ----------

const VIDEO_APPS = new Set([
  "youtube",
  "vlc",
  "iina",
  "mpv",
  "netflix",
  "twitch",
  "disney+",
  "tving",
  "wavve",
  "coupang play",
]);

const CODE_EDITORS = new Set([
  "code",
  "visual studio code",
  "cursor",
  "webstorm",
  "intellij idea",
  "pycharm",
  "xcode",
  "android studio",
  "neovim",
  "vim",
  "sublime text",
  "zed",
]);

const SOCIAL_MEDIA = new Set([
  "twitter",
  "x",
  "instagram",
  "facebook",
  "threads",
  "reddit",
  "tiktok",
  "mastodon",
]);


function matchesSet(appName: string, titleLower: string, names: Set<string>): boolean {
  const appLower = appName.toLowerCase();
  for (const name of names) {
    if (appLower.includes(name) || titleLower.includes(name)) {
      return true;
    }
  }
  return false;
}

export function isVideoApp(appName: string, title = ""): boolean {
  return matchesSet(appName, title.toLowerCase(), VIDEO_APPS);
}

export function isCodeEditor(appName: string, title = ""): boolean {
  return matchesSet(appName, title.toLowerCase(), CODE_EDITORS);
}

export function isSocialMedia(appName: string, title = ""): boolean {
  return matchesSet(appName, title.toLowerCase(), SOCIAL_MEDIA);
}


/**
 * Count how many times the user has switched TO a specific app
 * in the recent history (last 1 hour).
 */
export function countRecentSwitches(
  history: AppSession[],
  appName: string,
): number {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lower = appName.toLowerCase();
  return history.filter(
    (s) =>
      s.appName.toLowerCase().includes(lower) &&
      s.startTime > oneHourAgo,
  ).length;
}

// ---------- Reactive comment constants ----------

/** Minimum seconds between reactive (app-switch) LLM calls. */
const REACTIVE_COOLDOWN_SEC = 10;

/**
 * Maps the regular daily limit to a reactive daily limit.
 * Reactive comments are lightweight contextual reactions, so they
 * get a much higher budget than the intervention-style regular comments.
 */
const REACTIVE_DAILY_LIMITS: Record<number, number> = {
  0: 0,   // off
  1: 5,   // low
  3: 15,  // medium
  10: 25, // high
};

// ---------- Default rules ----------

const RULES: CommentRule[] = [
  {
    id: "youtube_long",
    condition: (s) =>
      isVideoApp(s.appName, s.title) && s.duration > 1800,
    messages: [
      "쉬엄쉬엄 봐~",
      "눈 좀 쉬어!",
      "영상 길다...",
      "한 30분 넘게 보고 있네!",
    ],
    emotion: "relaxed",
    cooldownMinutes: 120,
  },
  {
    id: "vscode_long",
    condition: (s) =>
      isCodeEditor(s.appName, s.title) && s.duration > 7200,
    messages: [
      "스트레칭 좀 해!",
      "허리 펴!",
      "쉬었다 해~",
      "2시간 넘게 코딩 중...",
    ],
    emotion: "thinking",
    cooldownMinutes: 120,
  },
  {
    id: "late_night",
    condition: (_s, _h, hour) => hour >= 2 && hour < 5,
    messages: [
      "자라...",
      "새벽인데 아직 안 자?",
      "내일도 있잖아",
      "이 시간에 자야 해...",
    ],
    emotion: "sad",
    cooldownMinutes: 60,
  },
  {
    id: "twitter_again",
    condition: (s, history) =>
      isSocialMedia(s.appName, s.title) &&
      countRecentSwitches(history, s.appName) > 3,
    messages: [
      "또 트위터야?",
      "좀 전에도 봤잖아...",
      "SNS 그만!",
      "또 열었네...",
    ],
    emotion: "surprised",
    cooldownMinutes: 90,
  },
  {
    id: "long_session_general",
    condition: (s) => s.duration > 5400, // 90 minutes of any single app
    messages: [
      "좀 쉬는 게 어때?",
      "물이라도 마셔!",
      "잠깐 스트레칭!",
    ],
    emotion: "neutral",
    cooldownMinutes: 90,
  },
];

// ---------- CommentEngine ----------

/**
 * Rule-based comment engine for instant reactions (no LLM call).
 *
 * Evaluates pattern-matching rules against app sessions and fires
 * short comments when conditions are met. LLM-based reactive comments
 * (app-switch reactions via OpenClaw) are handled separately in App.tsx.
 *
 * Enforces daily limits and per-rule cooldowns.
 */
export class CommentEngine {
  private _rules: CommentRule[];
  private _dailyLimit: number;
  private _dailyCount: number;
  private _reactiveDailyLimit: number;
  private _reactiveDailyCount: number;
  private _dailyResetDate: string; // "YYYY-MM-DD"
  private _muted: boolean;
  private _muteUntil: number; // Unix timestamp (ms), 0 = not timed
  private _cooldowns: Map<string, number>; // ruleId -> last-fire timestamp

  constructor(dailyLimit = 3) {
    this._rules = [...RULES];
    this._dailyLimit = dailyLimit;
    this._reactiveDailyLimit = REACTIVE_DAILY_LIMITS[dailyLimit] ?? 30;
    this._reactiveDailyCount = 0;
    this._dailyCount = 0;
    this._dailyResetDate = this.todayString();
    this._muted = false;
    this._muteUntil = 0;
    this._cooldowns = new Map();
  }

  // ---------- Public API ----------

  /**
   * Evaluate the current app session and history against all rules.
   *
   * Returns a CommentResult if a rule matches, or null if nothing triggers.
   */
  evaluate(
    session: AppSession,
    history: AppSession[],
  ): CommentResult | null {
    this.checkDailyReset();

    // Check mute state
    if (this.isMuted()) return null;

    // Check daily limit
    if (this._dailyCount >= this._dailyLimit) return null;

    const currentHour = new Date().getHours();

    for (const rule of this._rules) {
      // Check per-rule cooldown
      if (this.isOnCooldown(rule)) continue;

      // Evaluate condition
      if (rule.condition(session, history, currentHour)) {
        // Pick a random message
        const text =
          rule.messages[Math.floor(Math.random() * rule.messages.length)];

        log.info(
          `[CommentEngine] Rule "${rule.id}" fired for ${session.appName} (${session.duration}s):`,
          text,
        );

        // Record cooldown and increment daily count
        this._cooldowns.set(rule.id, Date.now());
        this._dailyCount++;

        return {
          text,
          emotion: rule.emotion,
          source: "rule",
        };
      }
    }

    return null;
  }

  /** Set the maximum number of comments per day. */
  setDailyLimit(limit: number): void {
    this._dailyLimit = Math.max(0, limit);
    this._reactiveDailyLimit = REACTIVE_DAILY_LIMITS[limit] ?? 30;
  }

  /**
   * Mute or unmute the comment engine.
   *
   * @param muted     - Whether to mute.
   * @param durationMs - Optional: auto-unmute after this many milliseconds.
   */
  setMuted(muted: boolean, durationMs?: number): void {
    this._muted = muted;
    if (muted && durationMs && durationMs > 0) {
      this._muteUntil = Date.now() + durationMs;
    } else if (!muted) {
      this._muteUntil = 0;
    }
  }

  /** Returns the number of comments remaining for today. */
  getRemainingComments(): number {
    this.checkDailyReset();
    return Math.max(0, this._dailyLimit - this._dailyCount);
  }

  /**
   * Check whether the engine should react to an app switch.
   * Returns true if not muted, under daily limit, and past the cooldown.
   * The caller is responsible for sending the app info to OpenClaw.
   */
  shouldReactToAppSwitch(): boolean {
    this.checkDailyReset();

    if (this.isMuted()) return false;
    if (this._reactiveDailyCount >= this._reactiveDailyLimit) return false;

    // Global reactive cooldown to prevent spam on rapid switching
    const lastReactive = this._cooldowns.get("__reactive__");
    if (lastReactive) {
      const elapsed = (Date.now() - lastReactive) / 1000;
      if (elapsed < REACTIVE_COOLDOWN_SEC) return false;
    }

    this._cooldowns.set("__reactive__", Date.now());
    this._reactiveDailyCount++;

    return true;
  }

  /** Add a custom rule at runtime. */
  addRule(rule: CommentRule): void {
    this._rules.push(rule);
  }

  // ---------- Internal helpers ----------

  /** Check if the engine is currently muted. */
  private isMuted(): boolean {
    if (!this._muted) return false;

    // Check timed mute expiration
    if (this._muteUntil > 0 && Date.now() >= this._muteUntil) {
      this._muted = false;
      this._muteUntil = 0;
      return false;
    }

    return true;
  }

  /** Check if a rule is still on cooldown. */
  private isOnCooldown(rule: CommentRule): boolean {
    const lastFired = this._cooldowns.get(rule.id);
    if (!lastFired) return false;

    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    return Date.now() - lastFired < cooldownMs;
  }

  /** Reset daily count at midnight. */
  private checkDailyReset(): void {
    const today = this.todayString();
    if (today !== this._dailyResetDate) {
      this._dailyCount = 0;
      this._reactiveDailyCount = 0;
      this._dailyResetDate = today;
    }
  }

  /** Returns "YYYY-MM-DD" for the current local date. */
  private todayString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
