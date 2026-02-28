/**
 * ChatWindow types and CSS.
 *
 * The ChatWindow component was replaced by ChatInputBar + FtueChatWindow
 * (both in App.tsx). This module is kept for:
 *   - ChatMessage type (used by App.tsx, useFTUE.ts)
 *   - ChatWindow.css import (classes used by FtueChatWindow in App.tsx)
 */

import "./ChatWindow.css";

// ---------- Types ----------

export interface ChatMessage {
  id: string;
  role: "user" | "character";
  text: string;
  timestamp: number;
}
