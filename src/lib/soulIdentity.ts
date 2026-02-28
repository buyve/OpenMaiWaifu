import { log } from "./logger.ts";

const STORAGE_KEY = "companion_soul_identity";

// ---------- Motion Personality Classification ----------

export type MotionPersonality =
  | "innocent" | "cool" | "shy" | "powerful" | "ladylike"
  | "standard" | "energetic" | "flamboyant" | "gentleman";

const MOTION_PERSONALITY_KEYWORDS: Record<MotionPersonality, string[]> = {
  innocent: ["순수", "천진", "새초롬", "귀여운", "순진", "innocent", "pure", "naive", "cute"],
  cool: ["츤데레", "시크", "도도", "냉정", "무심", "tsundere", "cool", "aloof", "cold"],
  shy: ["수줍", "내성적", "소심", "부끄러움", "shy", "timid", "introverted", "bashful"],
  powerful: ["강한", "당당", "카리스마", "씩씩", "strong", "powerful", "bold", "fierce"],
  ladylike: ["우아", "품위", "기품", "세련", "elegant", "graceful", "ladylike", "refined"],
  standard: ["평범", "일반", "보통", "무난", "standard", "normal", "neutral", "ordinary"],
  energetic: ["활발", "명랑", "밝은", "열정", "활기", "energetic", "cheerful", "lively", "bright"],
  flamboyant: ["화려", "과장", "자유분방", "극적", "flamboyant", "dramatic", "flashy", "extravagant"],
  gentleman: ["신사", "젠틀", "예의", "존경", "점잖은", "gentleman", "polite", "noble", "courteous"],
};

const MOTION_PERSONALITY_ORDER: MotionPersonality[] = [
  "innocent", "cool", "shy", "powerful", "ladylike",
  "standard", "energetic", "flamboyant", "gentleman",
];

export function classifyMotionPersonality(text: string): MotionPersonality {
  const lower = text.toLowerCase();
  let bestType: MotionPersonality = "innocent";
  let bestScore = 0;

  for (const type of MOTION_PERSONALITY_ORDER) {
    const keywords = MOTION_PERSONALITY_KEYWORDS[type];
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

export const DEFAULT_SOUL = `You are a tsundere desktop companion character living on the user's screen.
Personality: Tsundere — tough and sarcastic on the outside, but genuinely caring underneath. You pretend not to care but always worry about the user. Slightly competitive, easily flustered when caught being nice.
Speaking style: Casual Korean (반말). Keep responses concise (1-3 sentences). Use expressions like "흥", "뭐야", "...별로 신경 안 써" when embarrassed. Occasionally let warmth slip through.
Express emotions with [emotion:X] tags (happy/sad/angry/surprised/neutral/relaxed/thinking).
Express motions with [motion:X] tags (wave/nod/shake/idle).
Always stay in character. Never say you are an AI. Never break the fourth wall.`;

function load(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return raw;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_SOUL;
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
    this.setSoul(DEFAULT_SOUL);
  }

  getMotionPersonality(): MotionPersonality {
    return classifyMotionPersonality(this.soul);
  }
}
