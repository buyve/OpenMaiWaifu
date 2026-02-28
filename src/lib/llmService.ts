/**
 * Centralized LLM wrapper for memory distillation, imagination, and belief extraction.
 *
 * All functions return `T | null` — null means failure (graceful degradation).
 * No retries; sendChat already has a 2-minute timeout.
 */

import type { Memory, EmotionTag } from "./memoryManager.ts";
import { sendChat } from "./openclaw.ts";
import { log } from "./logger.ts";
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

  const prompt = `[기억 증류 요청]
너는 기억 증류기야. 여러 기억의 공통 본질을 한두 문장으로 추출해.
구체적 날짜/상황은 버리고, 성격/관계/패턴만 남겨.
대상 티어: ${targetTier}

[기억 목록]
${memoryList}

반드시 아래 JSON 형식으로만 응답해:
{"distilled":"증류된 내용","emotions":["joy"],"intensity":0.7}`;

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
    : "없음";

  const prompt = `[상상력 생성 요청]
너는 데스크톱 캐릭터의 상상력이야. 츤데레 말투로 15~40자 한마디를 만들어.

[기억]
${memoryList || "기억 없음"}

[현재 상황]
시간: ${context.hour}시, 요일: ${context.dayOfWeek}
앱: ${context.currentApp ?? "없음"}
유휴: ${context.isIdle ? "예" : "아니오"}

[최근 상상]
${recentList}

반드시 아래 JSON 형식으로만 응답해:
{"action":"츤데레 한마디","emotion":"joy","scenario":"상황 설명(영어)"}`;

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
    : "없음";

  const prompt = `[자아 감각 추출 요청]
코어 메모리에서 "나는 ~한 존재다" 자아 감각을 추출해.
기존 믿음과 중복되지 않는 것만 추출해. 최대 3개.

[M0 기억]
${memoryList}

[기존 믿음]
${beliefList}

반드시 아래 JSON 형식으로만 응답해:
{"beliefs":[{"statement":"나는 ...","confidence":0.5,"memoryIds":["id1"]}]}`;

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
