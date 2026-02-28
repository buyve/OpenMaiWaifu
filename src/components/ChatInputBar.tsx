import { useState, useRef, useEffect, useCallback } from "react";
import { useChatSend } from "../hooks/useChatSend.ts";
import { INPUT_FOCUS_DELAY_MS } from "../lib/constants.ts";
import type { MemoryManager } from "../lib/memoryManager.ts";
import type { SoulManager } from "../lib/soulIdentity.ts";
import type { SenseOfSelfManager } from "../lib/senseOfSelf.ts";
import type { IslandManager } from "../lib/personalityIslands.ts";
import "./ChatInputBar.css";

// ---------- Types ----------

export interface ChatInputBarProps {
  isOpen: boolean;
  onClose: () => void;
  onEmotionChange?: (emotion: string) => void;
  onMotionTrigger?: (motion: string) => void;
  /** Called when the character responds (show in speech bubble). */
  onCharacterMessage?: (text: string) => void;
  /** Called when user sends a message (memory tracking). */
  onUserMessage?: (text: string) => void;
  memoryManager?: MemoryManager;
  soulManager?: SoulManager;
  senseOfSelf?: SenseOfSelfManager;
  islandManager?: IslandManager;
  /** Offset from bottom in pixels (e.g. for Dock height). */
  bottomOffset?: number;
}

// ---------- Component ----------

export default function ChatInputBar({
  isOpen,
  onClose,
  onEmotionChange,
  onMotionTrigger,
  onCharacterMessage,
  onUserMessage,
  memoryManager,
  soulManager,
  senseOfSelf,
  islandManager,
  bottomOffset,
}: ChatInputBarProps) {
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { isTyping, send } = useChatSend({
    onEmotionChange,
    onMotionTrigger,
    onCharacterMessage,
    onUserMessage,
    memoryManager,
    soulManager,
    senseOfSelf,
    islandManager,
  });

  // Focus input when bar opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), INPUT_FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;

    setInputText("");

    try {
      await send(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const display = msg.length > 0 && msg !== "undefined"
        ? `Sorry, something went wrong: ${msg.slice(0, 80)}`
        : "...";
      if (onCharacterMessage) onCharacterMessage(display);
    } finally {
      inputRef.current?.focus();
    }
  }, [inputText, isTyping, send, onCharacterMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!isOpen) return null;

  return (
    <div className="chat-input-bar" style={bottomOffset ? { bottom: bottomOffset } : undefined}>
      <div className="chat-input-bar-inner">
        {isTyping && (
          <div className="chat-input-bar-typing">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <input
          ref={inputRef}
          className="chat-input-bar-field"
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
          autoComplete="off"
        />
        <button
          className="chat-input-bar-send"
          onClick={handleSend}
          disabled={isTyping || !inputText.trim()}
          aria-label="Send message"
        >
          &#x2191;
        </button>
        <button
          className="chat-input-bar-close"
          onClick={onClose}
          aria-label="Close input"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
