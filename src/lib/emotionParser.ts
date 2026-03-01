// ---------- Types ----------

export interface ParsedResponse {
  /** Clean text with all tags stripped. */
  text: string;
  /** Extracted emotion or inferred from sentiment. Defaults to 'neutral'. */
  emotion: string;
  /** Extracted motion or null if none specified. */
  motion: string | null;
}

// ---------- Constants ----------

/** Supported emotion values. */
const VALID_EMOTIONS = new Set([
  "happy",
  "sad",
  "angry",
  "surprised",
  "neutral",
  "relaxed",
  "thinking",
]);

/** Supported motion values. */
const VALID_MOTIONS = new Set(["wave", "nod", "shake", "idle"]);

/** Tag extraction patterns. */
const EMOTION_TAG_REGEX = /\[emotion:(\w+)\]/gi;
const MOTION_TAG_REGEX = /\[motion:(\w+)\]/gi;

import { locale } from "./i18n";

// ---------- Sentiment keyword map ----------

interface SentimentRule {
  keywords: string[];
  emotion: string;
}

function getSentimentRules(): SentimentRule[] {
  const l = locale();
  return [
    { keywords: l.sentiment_happy_keywords, emotion: "happy" },
    { keywords: l.sentiment_sad_keywords, emotion: "sad" },
    { keywords: l.sentiment_angry_keywords, emotion: "angry" },
    { keywords: l.sentiment_surprised_keywords, emotion: "surprised" },
  ];
}

// ---------- Parser ----------

/**
 * Parse emotion and motion tags from an LLM response.
 *
 * Extracts `[emotion:xxx]` and `[motion:xxx]` tags, strips them from
 * the text, validates against known values, and falls back to simple
 * sentiment inference when no emotion tag is present.
 *
 * @param raw - The raw response text from the LLM.
 * @returns Parsed response with clean text, emotion, and motion.
 */
export function parseResponse(raw: string | null | undefined): ParsedResponse {
  // Defend against null/undefined/empty input from malformed backend responses
  if (!raw) {
    return { text: "", emotion: "neutral", motion: null };
  }

  let emotion: string | null = null;
  let motion: string | null = null;

  // Extract the first valid emotion tag
  const emotionMatches = [...raw.matchAll(EMOTION_TAG_REGEX)];
  for (const match of emotionMatches) {
    const value = match[1].toLowerCase();
    if (VALID_EMOTIONS.has(value)) {
      emotion = value;
      break;
    }
  }

  // Extract the first valid motion tag
  const motionMatches = [...raw.matchAll(MOTION_TAG_REGEX)];
  for (const match of motionMatches) {
    const value = match[1].toLowerCase();
    if (VALID_MOTIONS.has(value)) {
      motion = value;
      break;
    }
  }

  // Strip all tags from the text
  let text = raw
    .replace(EMOTION_TAG_REGEX, "")
    .replace(MOTION_TAG_REGEX, "")
    .trim();

  // Collapse multiple spaces/newlines left by tag removal
  text = text.replace(/\s{2,}/g, " ").trim();

  // If no emotion tag found, infer from sentiment
  if (!emotion) {
    emotion = inferSentiment(text);
  }

  return {
    text,
    emotion,
    motion,
  };
}

/**
 * Simple keyword-based sentiment inference.
 * Returns the first matching emotion or 'neutral'.
 */
function inferSentiment(text: string): string {
  const lower = text.toLowerCase();

  for (const rule of getSentimentRules()) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return rule.emotion;
      }
    }
  }

  return "neutral";
}
