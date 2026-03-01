/**
 * Centralized LLM wrapper for memory distillation, imagination, and belief extraction.
 *
 * All functions return `T | null` — null means failure (graceful degradation).
 * No retries; sendChat already has a 2-minute timeout.
 */

import type { Memory, EmotionTag } from "./memoryManager.ts";
import { sendChat } from "./openclaw.ts";
import { log } from "./logger.ts";
import { locale } from "./i18n";
import {
  LLM_DISTILL_MAX_MEMORIES,
  LLM_IMAGINATION_MAX_MEMORIES,
  LLM_BELIEF_MAX_M0,
} from "./constants.ts";

// ---------- Health Tracking ----------

/** Consecutive LLM failure counter for user feedback. */
let _consecutiveFailures = 0;
const FAILURE_THRESHOLD = 3;
let _onDegraded: ((failCount: number) => void) | null = null;

/** Register a callback for when LLM is degraded (N consecutive failures). */
export function onLLMDegraded(cb: (failCount: number) => void): void {
  _onDegraded = cb;
}

/** Reset the failure counter (e.g. on successful chat). */
export function resetLLMFailures(): void {
  _consecutiveFailures = 0;
}

function trackFailure(): void {
  _consecutiveFailures++;
  if (_consecutiveFailures === FAILURE_THRESHOLD) {
    _onDegraded?.(_consecutiveFailures);
  }
}

function trackSuccess(): void {
  _consecutiveFailures = 0;
}

// ---------- Types ----------

export interface DistillResult {
  distilledContent: string;
  emotions: EmotionTag[];
  intensity: number;
}

export interface ImaginationResult {
  action: string;
  emotion: EmotionTag;
  scenario: string;
}

export interface BeliefCandidate {
  statement: string;
  confidence: number;
  memoryIds: string[];
}

export interface BeliefExtractionResult {
  beliefs: BeliefCandidate[];
}

// ---------- Emotion Validation ----------

const VALID_EMOTIONS: Set<string> = new Set([
  "joy", "sadness", "anger", "fear", "disgust",
  "anxiety", "envy", "ennui", "nostalgia", "neutral",
]);

function isValidEmotion(e: unknown): e is EmotionTag {
  return typeof e === "string" && VALID_EMOTIONS.has(e);
}

function validateEmotion(e: unknown): EmotionTag {
  return isValidEmotion(e) ? e : "neutral";
}

function validateEmotions(arr: unknown): EmotionTag[] {
  if (!Array.isArray(arr)) return ["neutral"];
  const valid = arr.filter(isValidEmotion);
  return valid.length > 0 ? valid : ["neutral"];
}

// ---------- JSON Parser ----------

/**
 * Extract JSON from an LLM response that may contain markdown code blocks,
 * extra text, or raw JSON.
 */
export function extractJSON<T>(text: string): T | null {
  // Try markdown code block first: ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch { /* fall through */ }
  }

  // Try raw JSON (find first { or [)
  const jsonStart = text.search(/[{[]/);
  if (jsonStart !== -1) {
    const candidate = text.slice(jsonStart);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try to find matching closing brace/bracket
      const openChar = candidate[0];
      const closeChar = openChar === "{" ? "}" : "]";
      let depth = 0;
      for (let i = 0; i < candidate.length; i++) {
        if (candidate[i] === openChar) depth++;
        else if (candidate[i] === closeChar) depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(0, i + 1)) as T;
          } catch { break; }
        }
      }
    }
  }

  return null;
}

// ---------- LLM Functions ----------

/**
 * Distill multiple memories into a single essence.
 * Used during promotion to extract patterns from related memories.
 */
export async function distillMemories(
  memories: Memory[],
  targetTier: string,
): Promise<DistillResult | null> {
  if (memories.length === 0) return null;

  const memSlice = memories.slice(0, LLM_DISTILL_MAX_MEMORIES);
  const memoryList = memSlice
    .map((m, i) => `${i + 1}. [${m.emotions.join("+")}] ${m.content}`)
    .join("\n");

  const prompt = locale().llm_distill_prompt(targetTier, memoryList);

  try {
    const res = await sendChat(prompt);
    const parsed = extractJSON<{ distilled: string; emotions: EmotionTag[]; intensity: number }>(res.response);
    if (!parsed || !parsed.distilled) return null;

    trackSuccess();
    return {
      distilledContent: parsed.distilled,
      emotions: validateEmotions(parsed.emotions),
      intensity: typeof parsed.intensity === "number" ? Math.min(1, Math.max(0, parsed.intensity)) : 0.5,
    };
  } catch (err) {
    log.warn("[llmService] distillMemories failed:", err);
    trackFailure();
    return null;
  }
}

/**
 * Generate an imagination scenario based on memories and context.
 * Returns a tsundere one-liner for the speech bubble.
 */
export async function generateImagination(
  memories: Memory[],
  context: { hour: number; dayOfWeek: string; currentApp: string | null; isIdle: boolean },
  recentActions: string[],
): Promise<ImaginationResult | null> {
  const memSlice = memories.slice(0, LLM_IMAGINATION_MAX_MEMORIES);
  const memoryList = memSlice
    .map((m) => `- [${m.emotions.join("+")}] ${m.content}`)
    .join("\n");

  const recentList = recentActions.length > 0
    ? recentActions.map((a) => `- ${a}`).join("\n")
    : "";

  const prompt = locale().llm_imagination_prompt({
    memoryList,
    hour: context.hour,
    dayOfWeek: context.dayOfWeek,
    currentApp: context.currentApp,
    isIdle: context.isIdle,
    recentList,
  });

  try {
    const res = await sendChat(prompt);
    const parsed = extractJSON<{ action: string; emotion: EmotionTag; scenario: string }>(res.response);
    if (!parsed || !parsed.action) return null;

    trackSuccess();
    return {
      action: parsed.action,
      emotion: validateEmotion(parsed.emotion),
      scenario: parsed.scenario || "",
    };
  } catch (err) {
    log.warn("[llmService] generateImagination failed:", err);
    trackFailure();
    return null;
  }
}

/**
 * Extract "I am ___" belief statements from core memories.
 * Avoids duplicating existing beliefs.
 */
export async function extractBeliefs(
  m0Memories: Memory[],
  existingBeliefs: string[],
): Promise<BeliefExtractionResult | null> {
  const memSlice = m0Memories.slice(0, LLM_BELIEF_MAX_M0);
  const memoryList = memSlice
    .map((m) => `- [${m.id}] ${m.content}`)
    .join("\n");

  const beliefList = existingBeliefs.length > 0
    ? existingBeliefs.map((b) => `- ${b}`).join("\n")
    : "";

  const prompt = locale().llm_belief_prompt(memoryList, beliefList);

  try {
    const res = await sendChat(prompt);
    const parsed = extractJSON<{ beliefs: BeliefCandidate[] }>(res.response);
    if (!parsed || !Array.isArray(parsed.beliefs)) return null;

    // Validate and clamp confidence
    const validated = parsed.beliefs
      .filter((b) => b.statement && Array.isArray(b.memoryIds))
      .map((b) => ({
        statement: b.statement,
        confidence: typeof b.confidence === "number" ? Math.min(1, Math.max(0, b.confidence)) : 0.5,
        memoryIds: b.memoryIds,
      }));

    trackSuccess();
    return { beliefs: validated };
  } catch (err) {
    log.warn("[llmService] extractBeliefs failed:", err);
    trackFailure();
    return null;
  }
}
