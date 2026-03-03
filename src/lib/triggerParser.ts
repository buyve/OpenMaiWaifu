/**
 * triggerParser.ts — Parse free-text trigger descriptions into structured conditions.
 *
 * Uses the OpenClaw LLM to classify trigger text once at setup time.
 * Falls back to ambient if LLM is unavailable.
 */

import { sendChat } from "./openclaw.ts";
import { log } from "./logger.ts";

// ---------- Types ----------

export type ParsedTrigger =
  | { type: "emotion"; emotions: string[] }
  | { type: "event"; event: string }
  | { type: "ambient"; chance: number }
  | { type: "scheduled"; hourStart: number; hourEnd: number }
  | { type: "idle" };

// ---------- Constants ----------

const VALID_EMOTIONS = ["happy", "sad", "angry", "surprised", "neutral", "relaxed"];
const VALID_EVENTS = ["headpat", "greeting", "click"];

const FALLBACK_TRIGGER: ParsedTrigger = { type: "ambient", chance: 0.2 };

// ---------- Parser ----------

/**
 * Parse a free-text trigger description into a structured trigger condition.
 * Uses the LLM for classification. Falls back to ambient on failure.
 */
export async function parseTriggerText(triggerText: string): Promise<ParsedTrigger> {
  const prompt = buildPrompt(triggerText);

  try {
    const chatResponse = await sendChat(prompt);
    const response = chatResponse?.response;
    if (!response) {
      log.warn("[triggerParser] Empty LLM response, using fallback");
      return FALLBACK_TRIGGER;
    }

    const parsed = extractJson(response);
    if (parsed && validateTrigger(parsed)) {
      log.info(`[triggerParser] Parsed "${triggerText}" → ${JSON.stringify(parsed)}`);
      return parsed;
    }

    log.warn("[triggerParser] Invalid LLM response, using fallback:", response);
    return FALLBACK_TRIGGER;
  } catch (err) {
    log.warn("[triggerParser] LLM parsing failed, using fallback:", err);
    return FALLBACK_TRIGGER;
  }
}

function buildPrompt(triggerText: string): string {
  return `You are a JSON classifier. Given an animation trigger description, classify it into exactly ONE category.

Trigger description: "${triggerText}"

Categories:
1. emotion — triggered by character emotion state
   Response: {"type":"emotion","emotions":["happy"]}
   Valid emotions: ${VALID_EMOTIONS.join(", ")}

2. event — triggered by a specific user action
   Response: {"type":"event","event":"headpat"}
   Valid events: ${VALID_EVENTS.join(", ")}

3. ambient — plays randomly/occasionally during idle
   Response: {"type":"ambient","chance":0.3}
   chance is 0.0 to 1.0 (how likely per evaluation cycle)

4. scheduled — plays at specific times of day
   Response: {"type":"scheduled","hourStart":6,"hourEnd":9}
   hourStart/hourEnd are 0-23

5. idle — replaces the default idle/waiting animation
   Response: {"type":"idle"}

Respond with ONLY the JSON object, nothing else.`;
}

function extractJson(text: string): ParsedTrigger | null {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[^}]+\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as ParsedTrigger;
  } catch {
    return null;
  }
}

function validateTrigger(trigger: unknown): trigger is ParsedTrigger {
  if (!trigger || typeof trigger !== "object") return false;
  const t = trigger as Record<string, unknown>;

  switch (t.type) {
    case "emotion":
      return (
        Array.isArray(t.emotions) &&
        t.emotions.length > 0 &&
        t.emotions.every((e: unknown) => typeof e === "string" && VALID_EMOTIONS.includes(e as string))
      );
    case "event":
      return typeof t.event === "string" && VALID_EVENTS.includes(t.event);
    case "ambient":
      return typeof t.chance === "number" && t.chance >= 0 && t.chance <= 1;
    case "scheduled":
      return (
        typeof t.hourStart === "number" &&
        typeof t.hourEnd === "number" &&
        t.hourStart >= 0 &&
        t.hourStart <= 23 &&
        t.hourEnd >= 0 &&
        t.hourEnd <= 23
      );
    case "idle":
      return true;
    default:
      return false;
  }
}

/** Get a human-readable label for a parsed trigger. */
export function getTriggerLabel(trigger: ParsedTrigger): string {
  switch (trigger.type) {
    case "emotion":
      return trigger.emotions.join(", ");
    case "event":
      return trigger.event;
    case "ambient":
      return `random (${Math.round(trigger.chance * 100)}%)`;
    case "scheduled":
      return `${trigger.hourStart}:00–${trigger.hourEnd}:00`;
    case "idle":
      return "idle";
  }
}
