import { log } from "./logger.ts";
import { locale } from "./i18n";

const STORAGE_KEY = "companion_soul_identity";

// ---------- Motion Personality Classification ----------

export type MotionPersonality =
  | "innocent" | "cool" | "shy" | "powerful" | "ladylike"
  | "standard" | "energetic" | "flamboyant" | "gentleman";

function getMotionPersonalityKeywords(): Record<MotionPersonality, string[]> {
  const l = locale();
  return {
    innocent: l.personality_innocent_keywords,
    cool: l.personality_cool_keywords,
    shy: l.personality_shy_keywords,
    powerful: l.personality_powerful_keywords,
    ladylike: l.personality_ladylike_keywords,
    standard: l.personality_standard_keywords,
    energetic: l.personality_energetic_keywords,
    flamboyant: l.personality_flamboyant_keywords,
    gentleman: l.personality_gentleman_keywords,
  };
}

const MOTION_PERSONALITY_ORDER: MotionPersonality[] = [
  "innocent", "cool", "shy", "powerful", "ladylike",
  "standard", "energetic", "flamboyant", "gentleman",
];

export function classifyMotionPersonality(text: string): MotionPersonality {
  const lower = text.toLowerCase();
  let bestType: MotionPersonality = "innocent";
  let bestScore = 0;

  for (const type of MOTION_PERSONALITY_ORDER) {
    const keywords = getMotionPersonalityKeywords()[type];
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

export function getDefaultSoul(): string {
  return locale().default_soul;
}

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return raw;
  } catch {
    // localStorage unavailable
  }
  return getDefaultSoul();
}

function save(soul: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, soul);
  } catch (err) {
    log.error("[SoulManager] Failed to save soul:", err);
  }
}

export class SoulManager {
  private soul: string;

  constructor() {
    this.soul = load();
    // Ensure the soul is persisted on first run
    save(this.soul);
  }

  getSoul(): string {
    return this.soul;
  }

  setSoul(soul: string): void {
    this.soul = soul;
    save(soul);
  }

  reset(): void {
    this.setSoul(getDefaultSoul());
  }

  getMotionPersonality(): MotionPersonality {
    return classifyMotionPersonality(this.soul);
  }
}
