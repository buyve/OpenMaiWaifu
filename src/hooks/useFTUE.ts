import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatMessage } from "../components/ChatWindow";
import type { MemoryManager } from "../lib/memoryManager.ts";
import { FTUE_AUTO_OPEN_DELAY_MS, FTUE_WAVE_DELAY_MS } from "../lib/constants.ts";
import { locale } from "../lib/i18n";

// ---------- Constants ----------

const FTUE_COMPLETE_KEY = "companion_ftue_complete";
const USER_NAME_KEY = "companion_user_name";

// ---------- Types ----------

type FtuePhase = "none" | "greeting" | "ask_name" | "done";

export interface UseFTUEOptions {
  showSpeechBubble: (text: string) => void;
  emotionCallbackRef: MutableRefObject<((emotion: string) => void) | null>;
  motionCallbackRef: MutableRefObject<((motion: string) => void) | null>;
  memoryManager: MemoryManager;
  setIsChatOpen: (open: boolean) => void;
  onOpenClawSetupNeeded?: () => void;
}

export interface UseFTUEResult {
  ftuePhase: FtuePhase;
  ftueMessages: ChatMessage[];
  isFtueActive: boolean;
  handleFtueChatMessage: (text: string) => void;
}

// ---------- Helpers ----------

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isFtueComplete(): boolean {
  return localStorage.getItem(FTUE_COMPLETE_KEY) === "true";
}

// ---------- Hook ----------

/**
 * Manages the First Time User Experience (FTUE) flow:
 * greeting -> ask name -> save name -> done.
 */
export function useFTUE({
  showSpeechBubble,
  emotionCallbackRef,
  motionCallbackRef,
  memoryManager,
  setIsChatOpen,
  onOpenClawSetupNeeded,
}: UseFTUEOptions): UseFTUEResult {
  const [ftuePhase, setFtuePhase] = useState<FtuePhase>(
    isFtueComplete() ? "done" : "none",
  );
  const [ftueMessages, setFtueMessages] = useState<ChatMessage[]>([]);
  const ftueStartedRef = useRef(false);

  // FTUE flow: greeting -> open chat with name question
  // Note: cleanup resets ftueStartedRef so React StrictMode's
  // unmount-remount cycle can re-schedule the timer correctly.
  useEffect(() => {
    if (isFtueComplete() || ftueStartedRef.current) return;
    ftueStartedRef.current = true;

    // Phase 1: Show greeting speech bubble + wave animation
    setFtuePhase("greeting");
    showSpeechBubble(locale().ftue_greeting);

    // Trigger wave animation
    const waveTimer = setTimeout(() => {
      motionCallbackRef.current?.("wave");
    }, FTUE_WAVE_DELAY_MS);

    // Phase 2: After delay, open chat with name question
    const openTimer = setTimeout(() => {
      setFtuePhase("ask_name");
      const nameMsg: ChatMessage = {
        id: generateId(),
        role: "character",
        text: locale().ftue_name_question,
        timestamp: Date.now(),
      };
      setFtueMessages([nameMsg]);
      setIsChatOpen(true);
    }, FTUE_AUTO_OPEN_DELAY_MS);

    return () => {
      clearTimeout(waveTimer);
      clearTimeout(openTimer);
      ftueStartedRef.current = false;
    };
  }, [showSpeechBubble, motionCallbackRef, setIsChatOpen]);

  // Handle user's name entry during FTUE
  const handleFtueChatMessage = useCallback(
    (text: string) => {
      if (ftuePhase === "ask_name") {
        const userName = text.trim();
        if (userName) {
          localStorage.setItem(USER_NAME_KEY, userName);
          localStorage.setItem(FTUE_COMPLETE_KEY, "true");

          const responseText = locale().ftue_name_response(userName);

          const userMsg: ChatMessage = {
            id: generateId(),
            role: "user",
            text: userName,
            timestamp: Date.now(),
          };
          const charMsg: ChatMessage = {
            id: generateId(),
            role: "character",
            text: responseText,
            timestamp: Date.now(),
          };

          setFtueMessages((prev) => [...prev, userMsg, charMsg]);
          setFtuePhase("done");

          showSpeechBubble(responseText);

          // Trigger happy emotion
          emotionCallbackRef.current?.("happy");
          motionCallbackRef.current?.("nod");

          // Track user name as a core memory (M0)
          memoryManager.trackKnowledge(`User name: ${userName}`, "M0");

          // Check OpenClaw CLI health — trigger setup wizard if not configured
          invoke("check_openclaw_health")
            .then((healthy) => {
              if (!healthy && onOpenClawSetupNeeded) {
                onOpenClawSetupNeeded();
              }
            })
            .catch(() => {
              if (onOpenClawSetupNeeded) {
                onOpenClawSetupNeeded();
              }
            });
        }
      }
    },
    [ftuePhase, showSpeechBubble, emotionCallbackRef, motionCallbackRef, memoryManager, onOpenClawSetupNeeded],
  );

  const isFtueActive = ftuePhase === "ask_name";

  return {
    ftuePhase,
    ftueMessages,
    isFtueActive,
    handleFtueChatMessage,
  };
}
