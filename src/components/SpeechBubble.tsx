import { MutableRefObject, useEffect, useRef, useState, useCallback } from "react";
import {
  SPEECH_BUBBLE_DISPLAY_MS,
  SPEECH_BUBBLE_MS_PER_CHAR,
  SPEECH_BUBBLE_FADE_MS,
} from "../lib/constants.ts";

// ---------- Types ----------

export interface SpeechBubbleProps {
  /** The text to display in the speech bubble. */
  text: string;
  /** Whether the bubble should be visible. */
  visible: boolean;
  /** Live ref updated each frame with the character's head screen position. */
  positionRef: MutableRefObject<{ x: number; y: number }>;
  /** Called when the fade-out animation completes. */
  onFadeComplete?: () => void;
}

// Constants imported from constants.ts

// ---------- Component ----------

export default function SpeechBubble({
  text,
  visible,
  positionRef,
  onFadeComplete,
}: SpeechBubbleProps) {
  const [isFading, setIsFading] = useState(false);
  const [isShown, setIsShown] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // No JS truncation — CSS max-height + overflow-y: auto handles long text

  // rAF loop to follow character head position every frame
  const updatePosition = useCallback(() => {
    if (bubbleRef.current) {
      const pos = positionRef.current;
      bubbleRef.current.style.left = `${pos.x}px`;
      bubbleRef.current.style.top = `${pos.y}px`;
    }
    rafRef.current = requestAnimationFrame(updatePosition);
  }, [positionRef]);

  // Start/stop rAF loop based on visibility
  useEffect(() => {
    if (isShown) {
      rafRef.current = requestAnimationFrame(updatePosition);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isShown, updatePosition]);

  useEffect(() => {
    // Clear existing timers
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (displayTimerRef.current) {
      clearTimeout(displayTimerRef.current);
      displayTimerRef.current = null;
    }

    if (visible && text) {
      // Show the bubble
      setIsShown(true);
      setIsFading(false);

      // Display duration scales with text length so longer messages stay visible
      const duration = SPEECH_BUBBLE_DISPLAY_MS + text.length * SPEECH_BUBBLE_MS_PER_CHAR;

      // Start fade timer after display duration
      displayTimerRef.current = setTimeout(() => {
        setIsFading(true);

        // After fade completes, hide and notify parent
        fadeTimerRef.current = setTimeout(() => {
          setIsShown(false);
          setIsFading(false);
          onFadeComplete?.();
        }, SPEECH_BUBBLE_FADE_MS);
      }, duration);
    } else {
      setIsShown(false);
      setIsFading(false);
    }

    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (displayTimerRef.current) clearTimeout(displayTimerRef.current);
    };
  }, [visible, text, onFadeComplete]);

  if (!isShown) return null;

  return (
    <div
      ref={bubbleRef}
      className={`speech-bubble ${isFading ? "fading" : ""}`}
    >
      <div className="speech-bubble-text">{text}</div>
      <div className="speech-bubble-pointer" />
    </div>
  );
}
