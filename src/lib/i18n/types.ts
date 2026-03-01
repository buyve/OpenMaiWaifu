export type SupportedLocale =
  | "en" | "ko" | "ja" | "zh-CN" | "zh-TW"
  | "es" | "fr" | "de" | "pt" | "ru";

export interface LocaleStrings {
  // ── FTUE ──
  ftue_greeting: string;
  ftue_name_question: string;
  ftue_name_response: (userName: string) => string;

  // ── Comment Engine Messages ──
  comment_youtube_long: string[];
  comment_vscode_long: string[];
  comment_late_night: string[];
  comment_twitter_again: string[];
  comment_long_session: string[];

  // ── Imagination Templates ──
  imagination_late_work: (isVeryLate: boolean) => string;
  imagination_morning: string;
  imagination_weekend: string;
  imagination_coding: (hours: number) => string;
  imagination_memory_recall: (contentSnippet: string) => string;
  imagination_day_names: string[];

  // ── Personality Island Names ──
  island_bond_name: string;
  island_tsundere_name: string;
  island_curiosity_name: string;

  // ── Island Events ──
  island_created: (emoji: string, name: string) => string;
  island_strengthened: (emoji: string, name: string) => string;
  island_shaking: (name: string) => string;
  island_collapsed: (name: string) => string;
  island_rebuilt: (name: string) => string;

  // ── Sense of Self Events ──
  self_anxiety_blocked: string;
  self_belief_formed: (statement: string) => string;
  self_belief_approved: (statement: string) => string;
  self_belief_rejected_removed: (statement: string) => string;
  self_belief_rejected_weakened: (statement: string) => string;
  self_belief_strengthened: (statement: string) => string;
  self_memory_removed: (statement: string) => string;
  self_memory_weakened: (statement: string, confidence: string) => string;

  // ── First Memory Recall ──
  recall_with_context: (contextHint: string) => string;
  recall_without_context: string;

  // ── App Messages ──
  quiet_mode_message: string;
  llm_degraded_message: string;
  model_loaded: (filename: string) => string;
  model_error: (error: string) => string;

  // ── Reactive Comment Prompt ──
  reactive_prompt: (appName: string, title: string, url: string | null, memoryContext: string | null) => string;

  // ── Memory Tracking Labels ──
  memory_rule_comment: (appName: string, minutes: number, text: string) => string;
  memory_app_switch: (appName: string, text: string) => string;

  // ── Signal Keywords (Type B) ──
  signal_pin_keywords: string[];
  signal_forget_keywords: string[];

  // ── Recall Phrases (Type B) ──
  recall_phrases: string[];

  // ── Sentiment Keywords (Type B) ──
  sentiment_happy_keywords: string[];
  sentiment_sad_keywords: string[];
  sentiment_angry_keywords: string[];
  sentiment_surprised_keywords: string[];

  // ── Emotion Keywords (Type B) ──
  emotion_joy_keywords: string[];
  emotion_sadness_keywords: string[];
  emotion_anger_keywords: string[];
  emotion_fear_keywords: string[];
  emotion_disgust_keywords: string[];
  emotion_anxiety_keywords: string[];
  emotion_envy_keywords: string[];
  emotion_ennui_keywords: string[];
  emotion_nostalgia_keywords: string[];

  // ── Motion Personality Keywords (Type B) ──
  personality_innocent_keywords: string[];
  personality_cool_keywords: string[];
  personality_shy_keywords: string[];
  personality_powerful_keywords: string[];
  personality_ladylike_keywords: string[];
  personality_standard_keywords: string[];
  personality_energetic_keywords: string[];
  personality_flamboyant_keywords: string[];
  personality_gentleman_keywords: string[];

  // ── Stopwords (Type B) ──
  stopwords: string[];

  // ── LLM Prompts (Type C) ──
  llm_distill_prompt: (targetTier: string, memoryList: string) => string;
  llm_imagination_prompt: (params: {
    memoryList: string;
    hour: number;
    dayOfWeek: string;
    currentApp: string | null;
    isIdle: boolean;
    recentList: string;
  }) => string;
  llm_belief_prompt: (memoryList: string, beliefList: string) => string;

  // ── Default Soul (Type C) ──
  default_soul: string;

  // ── UI Labels ──
  ui_chat_title: string;
  ui_chat_placeholder: string;
  ui_settings_title: string;
  ui_settings_close: string;
  ui_character_title: string;
  ui_vrm_model: string;
  ui_vrm_sublabel: string;
  ui_choose_file: string;
  ui_reset: string;
  ui_system_title: string;
  ui_autostart: string;
  ui_autostart_error: string;
  ui_resource_usage: string;
  ui_memory_format: (mb: number) => string;
  ui_app_version: string;
  ui_version_footer: (version: string) => string;
  ui_language: string;
}
