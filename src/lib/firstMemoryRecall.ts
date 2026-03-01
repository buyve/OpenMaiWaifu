// ---------- Types ----------

export interface RecallMoment {
  detected: boolean;
  text: string;
  emotion: string;
  motion: string;
}

import { locale } from "./i18n";

// ---------- Constants ----------

const FIRST_RECALL_KEY = "companion_first_recall_triggered";

/**
 * Minimum chat count before recall detection activates.
 * Prevents triggering on early FTUE conversations where the companion
 * might just be echoing back data it was given moments ago.
 */
const MIN_CHAT_COUNT = 5;

// ---------- Detection ----------

/**
 * Check whether the companion's response indicates a first-time memory recall.
 *
 * Detection heuristics:
 * 1. Response contains one of the known recall phrases (Korean/English)
 * 2. The current chat history has more than MIN_CHAT_COUNT messages
 *    (to avoid false positives from FTUE data regurgitation)
 * 3. The first recall has not already been triggered (checked via localStorage)
 *
 * When detected, returns a RecallMoment with a special speech bubble text,
 * a surprised -> happy emotion combo, and a nod motion. This should only
 * trigger ONCE per user (tracked in localStorage).
 *
 * @param response - The companion's latest response text.
 * @param chatHistory - The full chat history up to this point.
 * @returns A RecallMoment if this is the first recall, or null otherwise.
 */
export function checkForRecallMoment(
  response: string,
  chatHistory: { role: string; text: string }[],
): RecallMoment | null {
  // Already triggered — never fire again
  if (hasRecallTriggered()) return null;

  // Not enough conversation history yet
  if (chatHistory.length < MIN_CHAT_COUNT) return null;

  // Check for recall phrases in the response
  const matchedPhrase = findRecallPhrase(response);
  if (!matchedPhrase) return null;

  // Extract context hint from the response for the speech bubble
  const contextHint = extractContextHint(response, matchedPhrase);

  // Mark as triggered so it never fires again
  markRecallTriggered();

  return {
    detected: true,
    text: contextHint
      ? locale().recall_with_context(contextHint)
      : locale().recall_without_context,
    emotion: "surprised",
    motion: "nod",
  };
}

/**
 * Check whether the first recall moment has already been triggered.
 */
export function hasRecallTriggered(): boolean {
  try {
    return localStorage.getItem(FIRST_RECALL_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Reset the recall trigger (for testing/debugging).
 */
export function resetRecallTrigger(): void {
  try {
    localStorage.removeItem(FIRST_RECALL_KEY);
  } catch {
    // Ignore
  }
}

// ---------- Helpers ----------

/** Find the first recall phrase that appears in the response. */
function findRecallPhrase(response: string): string | null {
  const lower = response.toLowerCase();
  for (const phrase of locale().recall_phrases) {
    if (lower.includes(phrase.toLowerCase())) {
      return phrase;
    }
  }
  return null;
}

/**
 * Extract a short context hint from the response around the recall phrase.
 * Returns a brief snippet (up to ~20 characters) surrounding the phrase,
 * or null if extraction fails.
 */
function extractContextHint(
  response: string,
  phrase: string,
): string | null {
  const lower = response.toLowerCase();
  const idx = lower.indexOf(phrase.toLowerCase());
  if (idx === -1) return null;

  // Take a window of text after the recall phrase
  const afterPhrase = response.slice(idx + phrase.length).trim();

  // Grab up to the next punctuation or 20 chars
  const match = afterPhrase.match(/^[^.!?~\n]{1,20}/);
  if (match && match[0].trim().length > 2) {
    return match[0].trim();
  }

  return null;
}

/** Mark the first recall as triggered in localStorage. */
function markRecallTriggered(): void {
  try {
    localStorage.setItem(FIRST_RECALL_KEY, "true");
  } catch {
    // localStorage unavailable — best effort
  }
}
