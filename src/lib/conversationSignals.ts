/**
 * Conversation Signal Detection
 *
 * Detects natural memory signals from user messages:
 * - "pin": User wants to remember something ("기억해", "remember this")
 * - "forget": User wants to forget something ("잊어", "됐어", "forget it")
 *
 * Keyword matching approach consistent with EMOTION_KEYWORDS in memoryManager.
 */

export type ConversationSignal = "pin" | "forget" | null;

const PIN_KEYWORDS: string[] = [
  // Korean
  "기억해", "기억해줘", "잊지마", "잊지마줘", "외워", "외워줘",
  "기억하고", "기억해놔", "메모해", "저장해",
  // English
  "remember this", "remember that", "don't forget", "keep this in mind",
  "save this", "memorize",
];

const FORGET_KEYWORDS: string[] = [
  // Korean
  "잊어", "잊어줘", "됐어", "잊어버려", "지워", "지워줘",
  "삭제해", "없던걸로", "취소해",
  // English
  "forget it", "forget that", "never mind", "nevermind",
  "delete that", "erase that", "undo that",
];

/**
 * Detect a conversation signal from user text.
 * Returns "pin", "forget", or null.
 */
export function detectConversationSignal(text: string): ConversationSignal {
  const lower = text.toLowerCase();

  for (const kw of PIN_KEYWORDS) {
    if (lower.includes(kw)) return "pin";
  }

  for (const kw of FORGET_KEYWORDS) {
    if (lower.includes(kw)) return "forget";
  }

  return null;
}
