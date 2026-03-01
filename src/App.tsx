import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import VRMViewer from "./components/VRMViewer";
import type { ChatMessage } from "./components/ChatWindow";
import ChatInputBar from "./components/ChatInputBar";
import SpeechBubble from "./components/SpeechBubble";
import Settings from "./components/Settings.tsx";
import SetupWizard from "./components/SetupWizard.tsx";
import type { CommentFrequency } from "./components/Settings.tsx";
import { useScreenWatch } from "./hooks/useScreenWatch.ts";
import type { AppSession } from "./hooks/useScreenWatch.ts";
import { useFTUE } from "./hooks/useFTUE.ts";
import { CommentEngine } from "./lib/commentEngine.ts";
import { sendChat, getBrowserUrl } from "./lib/openclaw.ts";
import { parseResponse } from "./lib/emotionParser.ts";
import { PrivacyManager } from "./lib/privacyManager.ts";
import type { PrivacySettings } from "./lib/privacyManager.ts";
import { MemoryManager } from "./lib/memoryManager.ts";
import { SoulManager, type MotionPersonality } from "./lib/soulIdentity.ts";
import { IslandManager } from "./lib/personalityIslands.ts";
import { SenseOfSelfManager } from "./lib/senseOfSelf.ts";
import { ImaginationEngine, type ImaginationContext } from "./lib/imaginationLand.ts";
import { checkForRecallMoment } from "./lib/firstMemoryRecall.ts";
import { onLLMDegraded } from "./lib/llmService.ts";
import { applyFirstRunSettings } from "./lib/firstRunBridge.ts";
import { locale } from "./lib/i18n";
import { log } from "./lib/logger.ts";
import {
  RECALL_MOMENT_DELAY_MS,
  RECALL_HAPPY_TRANSITION_MS,
  COMMENT_EVAL_INTERVAL_MS,
  MEMORY_WORKER_INTERVAL_MS,
  QUIET_MODE_DURATION_MS,
  FTUE_BUBBLE_WIDTH,
  FTUE_SCREEN_MARGIN,
  INPUT_FOCUS_DELAY_MS,
  migrateStorageKeys,
} from "./lib/constants.ts";
import "./App.css";

// ---------- Constants ----------

/**
 * Minimum seconds a user must stay on an app before the comment engine
 * evaluates it. Prevents spam on rapid app switching.
 */
const COMMENT_EVAL_MIN_DURATION_SEC = 10;

/** Map comment frequency to daily limit for the CommentEngine. */
const COMMENT_FREQ_LIMIT: Record<CommentFrequency, number> = {
  off: 0,
  low: 1,
  medium: 3,
  high: 10,
};

/** Settings persistence keys. */
const SETTINGS_BEHAVIOR_KEY = "companion_settings_behavior";
const SETTINGS_MODEL_NAME_KEY = "companion_settings_model_name";

/** Default behavior settings. */
interface BehaviorSettings {
  commentFrequency: CommentFrequency;
}

const DEFAULT_BEHAVIOR: BehaviorSettings = {
  commentFrequency: "medium",
};

function loadBehaviorSettings(): BehaviorSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_BEHAVIOR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BehaviorSettings>;
      return { ...DEFAULT_BEHAVIOR, ...parsed };
    }
  } catch {
    // Corrupted data -- fall back to defaults
  }
  return { ...DEFAULT_BEHAVIOR };
}

function saveBehaviorSettings(settings: BehaviorSettings): void {
  try {
    localStorage.setItem(SETTINGS_BEHAVIOR_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable
  }
}

// ---------- Storage Migration ----------

// Run once on module load — migrates old localStorage keys to companion_ prefix.
migrateStorageKeys();

// ---------- Component ----------

function App() {
  const [isOverCharacter, setIsOverCharacter] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [dockHeight, setDockHeight] = useState(0);

  // Speech bubble state
  const [speechText, setSpeechText] = useState("");
  const [speechVisible, setSpeechVisible] = useState(false);

  // Chat history ref for recall moment detection
  const chatHistoryRef = useRef<{ role: string; text: string }[]>([]);

  // Track last imagination ID to record feedback (positive/ignored)
  const lastImaginationIdRef = useRef<string | null>(null);

  // Refs for emotion/motion/loadVRM callbacks to pass into VRMViewer
  const emotionCallbackRef = useRef<((emotion: string) => void) | null>(null);
  const motionCallbackRef = useRef<((motion: string) => void) | null>(null);
  const loadVRMRef = useRef<((source: string | File) => void) | null>(null);

  // Character head screen position (updated every frame by VRMViewer)
  const characterScreenPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight * 0.2 });

  // ---------- First-run bridge (install wizard → localStorage) ----------

  useEffect(() => {
    applyFirstRunSettings().then((applied) => {
      if (applied) {
        log.info("[App] First-run settings from install wizard applied, reloading.");
        window.location.reload();
      }
    });
  }, []);

  // ---------- Phase 8: Settings ----------

  const [behaviorSettings, setBehaviorSettings] = useState<BehaviorSettings>(
    loadBehaviorSettings,
  );
  const [currentModelName, setCurrentModelName] = useState(
    () => localStorage.getItem(SETTINGS_MODEL_NAME_KEY) ?? "default.vrm",
  );
  // Force re-render of privacy settings from the manager
  const [privacySettingsState, setPrivacySettingsState] = useState<PrivacySettings | null>(null);

  // ---------- Phase 5: Privacy + Comment Engine ----------

  const privacyManager = useMemo(() => new PrivacyManager(), []);
  const commentEngine = useMemo(() => new CommentEngine(), []);

  // Initialize privacy settings state from manager
  // (needs to happen after privacyManager is created)
  useEffect(() => {
    setPrivacySettingsState(privacyManager.getSettings());
  }, [privacyManager]);

  // Sync comment engine daily limit with behavior settings
  useEffect(() => {
    const limit = COMMENT_FREQ_LIMIT[behaviorSettings.commentFrequency];
    commentEngine.setDailyLimit(limit);
  }, [behaviorSettings.commentFrequency, commentEngine]);

  // ---------- Phase 7: Memory Manager ----------

  const memoryManager = useMemo(() => new MemoryManager(), []);
  const soulManager = useMemo(() => new SoulManager(), []);
  const motionPersonality: MotionPersonality = useMemo(
    () => soulManager.getMotionPersonality(),
    [soulManager],
  );
  const islandManager = useMemo(() => new IslandManager(), []);
  const senseOfSelf = useMemo(() => new SenseOfSelfManager(), []);
  const imagination = useMemo(() => new ImaginationEngine(), []);

  /**
   * Process newly promoted M0 memories:
   * - Auto-link to matching personality islands by keyword
   * - Trigger belief extraction if M0 set changed
   */
  const processNewM0 = useCallback(
    async (newM0: Awaited<ReturnType<typeof memoryManager.runPromotionPipeline>>["newM0"]) => {
      if (newM0.length === 0) return;

      // Auto-link M0 memories to personality islands by keyword matching
      const islands = islandManager.getIslands();
      for (const mem of newM0) {
        const lower = mem.content.toLowerCase();
        for (const island of islands) {
          const islandNameLower = island.name.toLowerCase();
          const islandDescLower = island.description.toLowerCase();
          // Simple keyword match: if memory content contains island name or description words
          if (lower.includes(islandNameLower) || islandDescLower.split(/\s+/).some((w) => w.length > 3 && lower.includes(w))) {
            const event = islandManager.linkMemory(island.id, mem.id);
            if (event) {
              showSpeechBubbleRef.current(event.message);
            }
            break; // Link to first matching island
          }
        }
      }

      // Trigger belief extraction on M0 change
      try {
        const m0 = await memoryManager.getMemories("M0");
        if (senseOfSelf.hasM0Changed(m0)) {
          const events = await senseOfSelf.autoExtractBeliefs(m0);
          for (const event of events) {
            showSpeechBubbleRef.current(event.message);
          }
        }
      } catch (err) {
        log.warn("[App] Belief extraction after M0 promotion failed:", err);
      }
    },
    [memoryManager, islandManager, senseOfSelf],
  );

  // Initialize memory systems: manager, islands, sense of self, imagination
  useEffect(() => {
    memoryManager.initialize().then(async () => {
      // Run memory workers on init
      memoryManager.runExpirationCheck();
      const result = await memoryManager.runPromotionPipeline();
      // Process any M0 promotions
      await processNewM0(result.newM0);
      // Check island health
      const collapseEvents = islandManager.runCollapseCheck();
      for (const event of collapseEvents) {
        showSpeechBubbleRef.current(event.message);
      }
    });
    memoryManager.setBlacklistChecker((content: string) => {
      const settings = privacyManager.getSettings();
      const lower = content.toLowerCase();
      return settings.blacklistedApps.some(
        (app) => lower.includes(app.toLowerCase()),
      );
    });

    // Reset sense of self session counter
    senseOfSelf.resetSession();

    // Memory workers: run promotion + expiration + belief extraction hourly
    const workerInterval = setInterval(async () => {
      memoryManager.runExpirationCheck();
      const result = await memoryManager.runPromotionPipeline();
      // Process any M0 promotions
      await processNewM0(result.newM0);
      islandManager.runCollapseCheck();

      // Also check for M0 changes from other sources (manual tracking, etc.)
      try {
        const m0 = await memoryManager.getMemories("M0");
        if (senseOfSelf.hasM0Changed(m0)) {
          const events = await senseOfSelf.autoExtractBeliefs(m0);
          for (const event of events) {
            showSpeechBubbleRef.current(event.message);
          }
        }
      } catch (err) {
        log.warn("[App] Belief extraction failed:", err);
      }
    }, MEMORY_WORKER_INTERVAL_MS);

    return () => clearInterval(workerInterval);
  }, [memoryManager, privacyManager, islandManager, senseOfSelf, processNewM0]);

  const pollingInterval = privacyManager.getPollingInterval();

  const isBlacklisted = useCallback(
    (appName: string) => privacyManager.isAppBlacklisted(appName),
    [privacyManager],
  );

  // ---------- Speech Bubble Helpers ----------

  // Queue for speech bubbles so simultaneous comments are shown sequentially
  const speechQueueRef = useRef<string[]>([]);
  const speechActiveRef = useRef(false);

  const showNextBubble = useCallback(() => {
    if (speechQueueRef.current.length === 0) {
      speechActiveRef.current = false;
      return;
    }
    const next = speechQueueRef.current.shift()!;
    speechActiveRef.current = true;
    setSpeechText(next);
    setSpeechVisible(true);
  }, []);

  const showSpeechBubble = useCallback((text: string) => {
    if (!text) return;
    if (speechActiveRef.current) {
      // A bubble is already showing — queue this one
      speechQueueRef.current.push(text);
    } else {
      // No active bubble — show immediately
      speechActiveRef.current = true;
      setSpeechText(text);
      setSpeechVisible(true);
    }
  }, []);

  const handleSpeechFadeComplete = useCallback(() => {
    setSpeechVisible(false);
    setSpeechText("");
    // Show next queued bubble after a short gap
    if (speechQueueRef.current.length > 0) {
      setTimeout(showNextBubble, 400);
    } else {
      speechActiveRef.current = false;
    }
  }, [showNextBubble]);

  // ---------- FTUE ----------

  const handleOpenClawSetupNeeded = useCallback(() => {
    setIsSetupWizardOpen(true);
  }, []);

  const { ftueMessages, isFtueActive, handleFtueChatMessage } = useFTUE({
    showSpeechBubble,
    emotionCallbackRef,
    motionCallbackRef,
    memoryManager,
    setIsChatOpen,
    onOpenClawSetupNeeded: handleOpenClawSetupNeeded,
  });

  // ---------- LLM degradation feedback ----------

  useEffect(() => {
    onLLMDegraded(() => {
      showSpeechBubbleRef.current(locale().llm_degraded_message);
      emotionCallbackRef.current?.("sad");
    });
  }, []);

  // ---------- Comment evaluation ----------

  const showSpeechBubbleRef = useRef(showSpeechBubble);
  showSpeechBubbleRef.current = showSpeechBubble;

  /**
   * Evaluate the comment engine for the given app session.
   * If a comment triggers, show it as a speech bubble and apply the emotion.
   */
  const evaluateComment = useCallback(
    (session: AppSession, history: AppSession[]) => {
      if (session.duration < COMMENT_EVAL_MIN_DURATION_SEC) return;

      const result = commentEngine.evaluate(session, history);
      if (result) {
        log.info("[App] Comment triggered:", result.text, "emotion:", result.emotion);
        showSpeechBubbleRef.current(result.text);
        privacyManager.recordComment(result.text);

        // Apply emotion to the character
        emotionCallbackRef.current?.(result.emotion);

        // Track rule-based comments as M30 memories for context
        try {
          memoryManager.trackKnowledge(
            locale().memory_rule_comment(session.appName, Math.round(session.duration / 60), result.text),
            "M30",
            { source: "observation" },
          );
        } catch {
          // Best-effort
        }

        // Auto-open input bar so user can respond
        setIsChatOpen(true);
      }
    },
    [commentEngine, privacyManager, memoryManager],
  );

  // ---------- Screen Watch ----------

  // BUG-03 fix: Use refs for values accessed inside the interval so we don't
  // need currentApp/appHistory in the useEffect dependency array. This prevents
  // the 30-second interval from being reset every 5s poll cycle.
  const currentAppRef = useRef<AppSession | null>(null);
  const appHistoryRef = useRef<AppSession[]>([]);

  // Track in-flight reactive LLM call to prevent duplicates and races with user chat
  const reactivePendingRef = useRef(false);

  // BUG-04 fix: Implement handleAppChanged to evaluate comments on app switch
  const handleAppChanged = useCallback(
    (previous: AppSession | null, current: AppSession | null) => {
      // When leaving an app, evaluate comment engine for the previous session
      if (previous && previous.duration >= COMMENT_EVAL_MIN_DURATION_SEC) {
        evaluateComment(previous, appHistoryRef.current);
      }

      // Reactive: ask OpenClaw about the newly opened app
      // Skip if a reactive call is already in flight (prevents duplicates and race with user chat)
      if (current && !reactivePendingRef.current && commentEngine.shouldReactToAppSwitch()) {
        const appName = current.appName;
        const title = current.title;
        log.info("[App] Reactive: fetching context for", appName, title);

        reactivePendingRef.current = true;

        // Build context with memory for richer reactive comments
        const buildReactivePrompt = async () => {
          const url = await getBrowserUrl(appName);

          // Include memory context for more personalized reactions
          let memoryContext: string | null = null;
          try {
            memoryContext = await memoryManager.getContextForChat() || null;
          } catch {
            // Memory unavailable — proceed without it
          }

          const prompt = locale().reactive_prompt(appName, title, url, memoryContext);
          log.info("[App] Reactive: sending to OpenClaw:", appName, title);
          return sendChat(prompt);
        };

        buildReactivePrompt().then((res) => {
          const parsed = parseResponse(res.response);
          // Filter out CLI noise (status words like "complete", "done", etc.)
          const isCliNoise = parsed.text && /^(completed?|done|ok|error|success(ful)?|failed|ready|processing)$/i.test(parsed.text.trim());
          if (parsed.text && !isCliNoise) {
            log.info("[App] Reactive comment from LLM:", parsed.text);
            showSpeechBubbleRef.current(parsed.text);
            privacyManager.recordComment(parsed.text);
            emotionCallbackRef.current?.(parsed.emotion);

            // Track reactive comments as M30 memories for context
            try {
              memoryManager.trackKnowledge(
                locale().memory_app_switch(appName, parsed.text),
                "M30",
                { source: "observation" },
              );
            } catch {
              // Best-effort
            }
          }
        }).catch((err) => {
          log.warn("[App] Reactive OpenClaw call failed:", err);
        }).finally(() => {
          reactivePendingRef.current = false;
        });
      }
    },
    [evaluateComment, commentEngine, privacyManager, memoryManager],
  );

  const { currentApp, appHistory } = useScreenWatch(
    pollingInterval,
    isBlacklisted,
    handleAppChanged,
  );

  // Keep refs in sync with latest values
  currentAppRef.current = currentApp;
  appHistoryRef.current = appHistory;

  // Periodically evaluate the comment engine for the current app
  // BUG-03 fix: Dependency array no longer includes currentApp/appHistory,
  // so the interval is truly stable at 30 seconds.
  useEffect(() => {
    const evalInterval = setInterval(async () => {
      const app = currentAppRef.current;
      if (app) {
        evaluateComment(app, appHistoryRef.current);
      }

      // Mark previous imagination as "ignored" if user never opened chat
      if (lastImaginationIdRef.current) {
        imagination.recordFeedback(lastImaginationIdRef.current, "ignored");
        lastImaginationIdRef.current = null;
      }

      // Imagination Land: try to generate a proactive thought
      try {
        const memories = await memoryManager.getMemories();
        const now = new Date();
        const ctx: ImaginationContext = {
          currentApp: currentAppRef.current,
          hour: now.getHours(),
          dayOfWeek: now.getDay(),
          isIdle: !currentAppRef.current || (currentAppRef.current.duration < 10),
        };
        const thought = await imagination.imagine(memories, ctx);
        if (thought) {
          showSpeechBubbleRef.current(thought.action);
          emotionCallbackRef.current?.(thought.emotion);
          lastImaginationIdRef.current = thought.id;
        }
      } catch (err) {
        log.warn("[App] Imagination failed:", err);
      }
    }, COMMENT_EVAL_INTERVAL_MS);

    return () => clearInterval(evalInterval);
  }, [evaluateComment, memoryManager, imagination]);

  // ---------- Chat Callbacks ----------

  const handleChatClose = useCallback(() => {
    setIsChatOpen(false);
    // Also dismiss the speech bubble and clear the queue
    setSpeechVisible(false);
    setSpeechText("");
    speechQueueRef.current = [];
    speechActiveRef.current = false;
  }, []);

  const handleEmotionChange = useCallback((emotion: string) => {
    emotionCallbackRef.current?.(emotion);
  }, []);

  const handleMotionTrigger = useCallback((motion: string) => {
    motionCallbackRef.current?.(motion);
  }, []);

  /**
   * Handle character messages: show speech bubble and check for first recall moment.
   * When a recall moment is detected, triggers a special surprised -> happy emotion
   * sequence with a memory-referencing speech bubble.
   */
  const handleCharacterMessage = useCallback(
    (text: string) => {
      showSpeechBubble(text);

      // Track in chat history for recall detection
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "character", text },
      ];

      // Check for first memory recall moment
      const recall = checkForRecallMoment(text, chatHistoryRef.current);
      if (recall) {
        // Short delay so the normal speech bubble shows first, then the recall moment
        setTimeout(() => {
          showSpeechBubble(recall.text);
          emotionCallbackRef.current?.(recall.emotion);
          motionCallbackRef.current?.(recall.motion);

          // After the "surprised" moment, transition to "happy"
          setTimeout(() => {
            emotionCallbackRef.current?.("happy");
          }, RECALL_HAPPY_TRANSITION_MS);
        }, RECALL_MOMENT_DELAY_MS);

        // Track the recall as a memory
        memoryManager.trackKnowledge(
          `First recall moment: "${recall.text}"`,
          "M0",
        );
      }
    },
    [showSpeechBubble, memoryManager],
  );

  /**
   * Track user messages in chat history for recall moment detection.
   */
  const handleUserMessage = useCallback(
    (text: string) => {
      // If user sends a message after an imagination, record positive feedback
      if (lastImaginationIdRef.current) {
        imagination.recordFeedback(lastImaginationIdRef.current, "positive");
        lastImaginationIdRef.current = null;
      }

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "user", text },
      ];
    },
    [],
  );

  // ---------- Phase 8: Settings Panel Handlers ----------

  const handleSettingsClose = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const handleModelChange = useCallback((file: File) => {
    setCurrentModelName(file.name);
    localStorage.setItem(SETTINGS_MODEL_NAME_KEY, file.name);
    loadVRMRef.current?.(file);
  }, []);

  const handleModelReset = useCallback(() => {
    setCurrentModelName("default.vrm");
    localStorage.setItem(SETTINGS_MODEL_NAME_KEY, "default.vrm");
  }, []);

  const handleCommentFrequencyChange = useCallback(
    (freq: CommentFrequency) => {
      setBehaviorSettings((prev) => {
        const updated = { ...prev, commentFrequency: freq };
        saveBehaviorSettings(updated);
        return updated;
      });
    },
    [],
  );

  const handlePrivacySettingsChange = useCallback(
    (partial: Partial<PrivacySettings>) => {
      privacyManager.updateSettings(partial);
      setPrivacySettingsState(privacyManager.getSettings());
    },
    [privacyManager],
  );


  // ---------- Phase 8: Escape Key Handler ----------

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close panels in priority order: wizard > settings > chat
        if (isSetupWizardOpen) {
          setIsSetupWizardOpen(false);
        } else if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isChatOpen) {
          setIsChatOpen(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSetupWizardOpen, isSettingsOpen, isChatOpen]);

  // ---------- Expose emotion/motion setters for VRMViewer ----------
  // These will be set by the VRMViewer component via exposed callbacks

  const handleVRMEmotionSetter = useCallback(
    (setter: (emotion: string) => void) => {
      emotionCallbackRef.current = setter;
    },
    [],
  );

  const handleVRMMotionSetter = useCallback(
    (setter: (motion: string) => void) => {
      motionCallbackRef.current = setter;
    },
    [],
  );

  // ---------- Event Listeners ----------
  // BUG-01 fix: Use cancelled flag pattern to prevent listener leaks when
  // cleanup runs before listen() Promises resolve.

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      // Listen for open-chat events (from double-click and tray)
      const unlistenOpenChat = await listen("open-chat", () => {
        setIsChatOpen(true);
      });
      if (cancelled) { unlistenOpenChat(); return; }
      unlisteners.push(unlistenOpenChat);

      const unlistenTrayChat = await listen("tray-open-chat", () => {
        setIsChatOpen(true);
      });
      if (cancelled) { unlistenTrayChat(); return; }
      unlisteners.push(unlistenTrayChat);

      // Quiet mode: mute comment engine for 30 minutes
      const unlistenQuiet = await listen("tray-quiet-mode", () => {
        commentEngine.setMuted(true, QUIET_MODE_DURATION_MS);
        showSpeechBubble(locale().quiet_mode_message);
      });
      if (cancelled) { unlistenQuiet(); return; }
      unlisteners.push(unlistenQuiet);

      // Settings: open the settings panel
      const unlistenSettings = await listen("tray-settings", () => {
        setIsSettingsOpen(true);
      });
      if (cancelled) { unlistenSettings(); return; }
      unlisteners.push(unlistenSettings);

      // Change character: open file picker for .vrm
      const unlistenChangeChar = await listen("tray-change-character", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".vrm";
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) loadVRMRef.current?.(file);
        };
        input.click();
      });
      if (cancelled) { unlistenChangeChar(); return; }
      unlisteners.push(unlistenChangeChar);
    };
    setup();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [commentEngine, showSpeechBubble]);

  return (
    <>
      <VRMViewer
        onHitTestChange={setIsOverCharacter}
        onEmotionSetterReady={handleVRMEmotionSetter}
        onMotionSetterReady={handleVRMMotionSetter}
        onLoadVRMReady={(fn) => { loadVRMRef.current = fn; }}
        forceInteractive={isChatOpen || isSettingsOpen}
        characterScreenPosRef={characterScreenPosRef}
        onDockHeightChange={setDockHeight}
        personality={motionPersonality}
        onModelLoaded={(filename) => {
          setCurrentModelName(filename);
          showSpeechBubble(locale().model_loaded(filename));
        }}
        onModelError={(error) => {
          showSpeechBubble(locale().model_error(error));
          emotionCallbackRef.current?.("sad");
        }}
      />

      {/* Debug overlay */}
      <div className={`debug-overlay ${isOverCharacter ? "hit" : ""}`}>
        {isOverCharacter ? "HIT (interactive)" : "PASS-THROUGH"}
      </div>

      {/* Speech bubble — always visible (character's words appear here) */}
      <SpeechBubble
        text={speechText}
        visible={speechVisible}
        positionRef={characterScreenPosRef}
        onFadeComplete={handleSpeechFadeComplete}
      />

      {/* Chat: FTUE uses the full ChatWindow, normal mode uses bottom input bar */}
      {isFtueActive ? (
        <FtueChatWindow
          isOpen={isChatOpen}
          onClose={handleChatClose}
          initialMessages={ftueMessages}
          onFtueMessage={handleFtueChatMessage}
          anchorRef={characterScreenPosRef}
        />
      ) : (
        <ChatInputBar
          isOpen={isChatOpen}
          onClose={handleChatClose}
          onEmotionChange={handleEmotionChange}
          onMotionTrigger={handleMotionTrigger}
          onCharacterMessage={handleCharacterMessage}
          onUserMessage={handleUserMessage}
          memoryManager={memoryManager}
          soulManager={soulManager}
          senseOfSelf={senseOfSelf}
          islandManager={islandManager}
          bottomOffset={dockHeight}
        />
      )}

      {/* Settings panel */}
      {privacySettingsState && (
        <Settings
          isOpen={isSettingsOpen}
          onClose={handleSettingsClose}
          currentModelName={currentModelName}
          onModelChange={handleModelChange}
          onModelReset={handleModelReset}
          commentFrequency={behaviorSettings.commentFrequency}
          onCommentFrequencyChange={handleCommentFrequencyChange}
          privacySettings={privacySettingsState}
          onPrivacySettingsChange={handlePrivacySettingsChange}
          onOpenSetupWizard={() => {
            setIsSettingsOpen(false);
            setIsSetupWizardOpen(true);
          }}
        />
      )}

      {/* Setup Wizard */}
      <SetupWizard
        isOpen={isSetupWizardOpen}
        onClose={() => setIsSetupWizardOpen(false)}
        onComplete={() => setIsSetupWizardOpen(false)}
      />

      {/* Bottom-left buttons: Memory + Settings */}
      {!isFtueActive && (
        <div className="bottom-left-buttons" style={{ bottom: 16 + dockHeight }}>
          <button
            className="settings-toggle-btn"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            data-hit-target
          >
            &#x2699;
          </button>
        </div>
      )}
    </>
  );
}

// ---------- FTUE Chat Window ----------
// A simplified chat window that intercepts the first message for FTUE name capture.

interface FtueChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialMessages: ChatMessage[];
  onFtueMessage: (text: string) => void;
  anchorRef?: React.RefObject<{ x: number; y: number }>;
}

// FTUE_BUBBLE_WIDTH and FTUE_SCREEN_MARGIN imported from constants.ts

function FtueChatWindow({
  isOpen,
  onClose,
  initialMessages,
  onFtueMessage,
  anchorRef,
}: FtueChatWindowProps) {
  const [inputText, setInputText] = useState("");
  const [bubblePos, setBubblePos] = useState<{ left: number; top: number }>({
    left: window.innerWidth / 2 - FTUE_BUBBLE_WIDTH / 2,
    top: window.innerHeight * 0.5,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track anchor position via rAF when open
  useEffect(() => {
    if (!isOpen || !anchorRef) return;
    let rafId: number;
    const track = () => {
      const anchor = anchorRef.current;
      let left = anchor.x - FTUE_BUBBLE_WIDTH / 2;
      const top = anchor.y;
      left = Math.max(FTUE_SCREEN_MARGIN, Math.min(left, window.innerWidth - FTUE_BUBBLE_WIDTH - FTUE_SCREEN_MARGIN));
      setBubblePos({ left, top });
      rafId = requestAnimationFrame(track);
    };
    rafId = requestAnimationFrame(track);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, anchorRef]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [initialMessages]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, INPUT_FOCUS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    onFtueMessage(text);
  }, [inputText, onFtueMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const positionStyle = anchorRef
    ? { left: bubblePos.left, top: bubblePos.top }
    : { right: 16, bottom: 0 };

  return (
    <div
      className={`chat-window ${isOpen ? "open" : ""}`}
      style={positionStyle}
    >
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="chat-header-title">{locale().ui_chat_title}</span>
        </div>
        <button
          className="chat-close-btn"
          onClick={onClose}
          aria-label="Close chat"
        >
          &times;
        </button>
      </div>

      <div className="chat-messages">
        {initialMessages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="chat-bubble">{msg.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder={locale().ui_chat_placeholder}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim()}
          aria-label="Send message"
        >
          &#x2191;
        </button>
      </div>

      {/* Pointer triangle */}
      {anchorRef && <div className="chat-bubble-pointer" />}
    </div>
  );
}

export default App;
