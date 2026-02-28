import { useState, useCallback } from "react";
import { sendChat } from "../lib/openclaw.ts";
import { parseResponse } from "../lib/emotionParser.ts";
import { composeContext } from "../lib/contextComposer.ts";
import { detectConversationSignal } from "../lib/conversationSignals.ts";
import type { MemoryManager } from "../lib/memoryManager.ts";
import type { SoulManager } from "../lib/soulIdentity.ts";
import type { SenseOfSelfManager } from "../lib/senseOfSelf.ts";
import type { IslandManager } from "../lib/personalityIslands.ts";
import { log } from "../lib/logger.ts";

// ---------- Types ----------

export interface UseChatSendOptions {
  onEmotionChange?: (emotion: string) => void;
  onMotionTrigger?: (motion: string) => void;
  onCharacterMessage?: (text: string) => void;
  onUserMessage?: (text: string) => void;
  memoryManager?: MemoryManager;
  soulManager?: SoulManager;
  senseOfSelf?: SenseOfSelfManager;
  islandManager?: IslandManager;
}

export interface UseChatSendResult {
  /** Whether a response is currently being awaited. */
  isTyping: boolean;
  /**
   * Send a message to the character and trigger emotion/motion/message callbacks.
   * Returns the parsed character reply text on success, or null on failure.
   */
  send: (text: string) => Promise<string | null>;
}

// ---------- Hook ----------

/**
 * Shared hook that encapsulates the send-chat-and-parse-response pipeline.
 * Used by both ChatWindow and ChatInputBar.
 */
export function useChatSend({
  onEmotionChange,
  onMotionTrigger,
  onCharacterMessage,
  onUserMessage,
  memoryManager,
  soulManager,
  senseOfSelf,
  islandManager,
}: UseChatSendOptions): UseChatSendResult {
  const [isTyping, setIsTyping] = useState(false);

  const send = useCallback(
    async (text: string): Promise<string | null> => {
      if (!text.trim() || isTyping) return null;

      setIsTyping(true);

      if (onUserMessage) onUserMessage(text);

      try {
        let context: string | undefined;
        if (soulManager && memoryManager) {
          context = await composeContext(soulManager, memoryManager, senseOfSelf, islandManager);
        }
        const rawResponse = await sendChat(text, context);
        const parsed = parseResponse(rawResponse.response);

        // Skip callbacks for empty responses (backend returned no content)
        if (!parsed.text) {
          log.warn("[useChatSend] Empty response from backend, skipping callbacks");
          return null;
        }

        const emotion = parsed.emotion;
        const motion = parsed.motion;

        if (emotion && onEmotionChange) onEmotionChange(emotion);
        if (motion && onMotionTrigger) onMotionTrigger(motion);

        if (onCharacterMessage) onCharacterMessage(parsed.text);

        // Auto-track conversation as M30 memory for context retention
        if (memoryManager) {
          try {
            const summary = `User: "${text.slice(0, 80)}" → Character: "${parsed.text.slice(0, 80)}"`;
            const newMem = memoryManager.trackKnowledge(summary, "M30", {
              source: "conversation",
            });

            // Detect conversation signals (pin/forget)
            const signal = detectConversationSignal(text);
            if (signal === "pin") {
              log.info("[useChatSend] Pin signal detected, promoting memory:", newMem.id);
              memoryManager.pinMemory(newMem.id).catch(() => {
                // Best-effort pin
              });
            } else if (signal === "forget") {
              const lastMem = memoryManager.getLastConversationMemory();
              // Soft-delete the previous conversation memory, not the one we just created
              if (lastMem && lastMem.id !== newMem.id) {
                log.info("[useChatSend] Forget signal detected, soft-deleting:", lastMem.id);
                memoryManager.softDeleteMemory(lastMem.id).catch(() => {
                  // Best-effort forget
                });
              }
            }
          } catch {
            // Memory tracking is best-effort, don't break chat flow
          }
        }

        return parsed.text;
      } catch (err) {
        log.error("[useChatSend] sendChat failed:", err);
        throw err;
      } finally {
        setIsTyping(false);
      }
    },
    [
      isTyping,
      onEmotionChange,
      onMotionTrigger,
      onCharacterMessage,
      onUserMessage,
      soulManager,
      memoryManager,
      senseOfSelf,
      islandManager,
    ],
  );

  return { isTyping, send };
}
