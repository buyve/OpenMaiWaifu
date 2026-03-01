/**
 * Conversation Signal Detection
 *
 * Detects natural memory signals from user messages:
 * - "pin": User wants to remember something
 * - "forget": User wants to forget something
 *
 * Keyword matching approach consistent with EMOTION_KEYWORDS in memoryManager.
 */

import { locale } from "./i18n";

export type ConversationSignal = "pin" | "forget" | null;

/**
 * Detect a conversation signal from user text.
 * Returns "pin", "forget", or null.
 */
export function detectConversationSignal(text: string): ConversationSignal {
  const lower = text.toLowerCase();

  for (const kw of locale().signal_pin_keywords) {
    if (lower.includes(kw)) return "pin";
  }

  for (const kw of locale().signal_forget_keywords) {
    if (lower.includes(kw)) return "forget";
  }

  return null;
}
