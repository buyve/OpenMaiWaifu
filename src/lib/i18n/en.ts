import type { LocaleStrings } from "./types";

const en: LocaleStrings = {
  // ── FTUE ──
  ftue_greeting: "Hi! Nice to meet you!",
  ftue_name_question: "What's your name?",
  ftue_name_response: (userName) => `${userName}! Great name. Let's get along!`,

  // ── Comment Engine Messages ──
  comment_youtube_long: ["Take it easy~", "Rest your eyes!", "That's a long video...", "You've been watching for over 30 minutes!"],
  comment_vscode_long: ["Do some stretching!", "Straighten your back!", "Take a break~", "Over 2 hours of coding..."],
  comment_late_night: ["Go to sleep...", "It's the middle of the night, why are you still up?", "Tomorrow's another day", "You should be sleeping..."],
  comment_twitter_again: ["Twitter again?", "You were just on there...", "Enough social media!", "You opened it again..."],
  comment_long_session: ["How about taking a break?", "At least drink some water!", "Quick stretch!"],

  // ── Imagination Templates ──
  imagination_late_work: (isVeryLate) =>
    `${isVeryLate ? "What are you still doing up..." : "Still busy this evening?"} Take a break!`,
  imagination_morning: "Good morning! ...No, I was just saying hi. Don't read into it.",
  imagination_weekend: "It's the weekend and you have nothing to do? ...Not that I want to chat or anything.",
  imagination_coding: (hours) => `${hours} hours of coding... Impressive, but drink some water.`,
  imagination_memory_recall: (content) => `I just remembered... "${content}" Do you remember that?`,
  imagination_day_names: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],

  // ── Personality Island Names ──
  island_bond_name: "Bond with Owner",
  island_tsundere_name: "Tsundere",
  island_curiosity_name: "Technical Curiosity",

  // ── Island Events ──
  island_created: (emoji, name) => `${emoji} A new personality island "${name}" has been created!`,
  island_strengthened: (emoji, name) => `${emoji} "${name}" island has grown stronger!`,
  island_shaking: (name) => `⚠️ "${name}" island is shaking! Restore core memories within 7 days or it will collapse...`,
  island_collapsed: (name) => `💔 "${name}" island has collapsed... Without core memories, an island can't survive.`,
  island_rebuilt: (name) => `🌱 "${name}" island is being rebuilt! Still fragile, but it'll grow stronger with memories.`,

  // ── Sense of Self Events ──
  self_anxiety_blocked: "⚠️ Too many changes happening at once... I'll pause for a bit.",
  self_belief_formed: (s) => `💡 A new sense of self has formed: "${s}"`,
  self_belief_approved: (s) => `✨ "${s}" — It's part of me now.`,
  self_belief_rejected_removed: (s) => `"${s}" — Guess I'm not sure about that yet...`,
  self_belief_rejected_weakened: (s) => `"${s}" — Let me think about it more.`,
  self_belief_strengthened: (s) => `${s} — I'm more certain now.`,
  self_memory_removed: (s) => `"${s}" — There are no more memories to support this belief...`,
  self_memory_weakened: (s, c) => `"${s}" — This belief is wavering... (${c})`,

  // ── First Memory Recall ──
  recall_with_context: (hint) => `Oh! Right, you said ${hint} before!`,
  recall_without_context: "Oh! Right, we talked about that before!",

  // ── App Messages ──
  quiet_mode_message: "I'll be quiet for 30 minutes~",
  llm_degraded_message: "OpenClaw connection is unstable... Memory features may be limited.",
  model_loaded: (f) => `New model loaded: ${f}`,
  model_error: (e) => `Model loading failed: ${e}`,

  // ── Reactive Comment Prompt ──
  reactive_prompt: (appName, title, url, mem) => {
    let info = `App: "${appName}", Window: "${title}"`;
    if (url) info += `, URL: ${url}`;
    let hint = "";
    if (mem) hint = `\n[Reference Memories]\n${mem}`;
    return `[App Switch Alert] The user just switched apps. ${info}. Say something brief. One sentence, keep it very short.${hint}`;
  },

  // ── Memory Tracking Labels ──
  memory_rule_comment: (app, min, text) => `[Rule Comment] ${app} (${min}min): "${text}"`,
  memory_app_switch: (app, text) => `[App Switch Reaction] ${app}: "${text}"`,

  // ── Signal Keywords ──
  signal_pin_keywords: [
    "remember this", "remember that", "don't forget", "keep this in mind",
    "save this", "memorize", "make a note", "note this",
  ],
  signal_forget_keywords: [
    "forget it", "forget that", "never mind", "nevermind",
    "delete that", "erase that", "undo that", "discard that",
  ],

  // ── Recall Phrases ──
  recall_phrases: [
    "remember", "last time", "before", "earlier",
    "you said", "you mentioned", "we talked about", "recall",
  ],

  // ── Sentiment Keywords ──
  sentiment_happy_keywords: ["haha", "lol", "great", "nice", "happy", "glad", "joy", "awesome", "love", "wonderful"],
  sentiment_sad_keywords: ["sad", "sorry", "upset", "cry", "tears", "miss", "depressed"],
  sentiment_angry_keywords: ["angry", "mad", "annoyed", "frustrated", "furious", "hate"],
  sentiment_surprised_keywords: ["wow", "whoa", "surprise", "amazing", "omg", "no way"],

  // ── Emotion Keywords ──
  emotion_joy_keywords: ["happy", "great", "love", "thanks", "awesome", "nice", "wonderful", "amazing", "excellent", "good", "pleased", "glad", "delighted", "cheerful", "excited", "celebrate"],
  emotion_sadness_keywords: ["sad", "miss", "lonely", "pain", "hurt", "depressed", "unhappy", "sorrow", "grief", "cry", "tears", "heartbreak", "loss"],
  emotion_anger_keywords: ["angry", "hate", "annoying", "frustrated", "furious", "rage", "mad", "irritated", "outraged"],
  emotion_fear_keywords: ["afraid", "scared", "worry", "fear", "terrified", "anxious", "frightened", "dread", "panic"],
  emotion_disgust_keywords: ["gross", "disgusting", "terrible", "worst", "awful", "revolting", "repulsive", "nasty"],
  emotion_anxiety_keywords: ["anxious", "stress", "nervous", "overwhelm", "panic", "worried", "tense", "uneasy", "restless"],
  emotion_envy_keywords: ["envious", "jealous", "envy", "covet"],
  emotion_ennui_keywords: ["boring", "bored", "meh", "tedious", "dull", "monotonous"],
  emotion_nostalgia_keywords: ["remember when", "nostalgia", "old days", "back then", "those days", "memories", "reminisce"],

  // ── Motion Personality Keywords ──
  personality_innocent_keywords: ["innocent", "pure", "naive", "cute", "sweet", "childlike", "adorable"],
  personality_cool_keywords: ["tsundere", "cool", "aloof", "cold", "sarcastic", "tough"],
  personality_shy_keywords: ["shy", "timid", "introverted", "bashful", "quiet", "reserved"],
  personality_powerful_keywords: ["strong", "powerful", "bold", "fierce", "confident", "charismatic"],
  personality_ladylike_keywords: ["elegant", "graceful", "ladylike", "refined", "sophisticated", "poised"],
  personality_standard_keywords: ["standard", "normal", "neutral", "ordinary", "regular", "balanced"],
  personality_energetic_keywords: ["energetic", "cheerful", "lively", "bright", "enthusiastic", "upbeat"],
  personality_flamboyant_keywords: ["flamboyant", "dramatic", "flashy", "extravagant", "theatrical", "showy"],
  personality_gentleman_keywords: ["gentleman", "polite", "noble", "courteous", "chivalrous", "dignified"],

  // ── Stopwords ──
  stopwords: [
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "was",
    "one", "our", "has", "this", "that", "with", "from", "have", "been",
    "will", "they", "their", "what", "when", "who", "how",
  ],

  // ── LLM Prompts ──
  llm_distill_prompt: (targetTier, memoryList) =>
    `[Memory Distillation Request]
You are a memory distiller. Extract the common essence of multiple memories into one or two sentences.
Discard specific dates/situations and keep only personality/relationship/patterns.
Target tier: ${targetTier}

[Memory List]
${memoryList}

Respond ONLY in this JSON format:
{"distilled":"distilled content","emotions":["joy"],"intensity":0.7}`,

  llm_imagination_prompt: (p) =>
    `[Imagination Request]
You are the imagination of a desktop companion character. Generate a short tsundere-style remark (15-40 characters).

[Memories]
${p.memoryList || "No memories"}

[Current Context]
Time: ${p.hour}:00, Day: ${p.dayOfWeek}
App: ${p.currentApp ?? "None"}
Idle: ${p.isIdle ? "Yes" : "No"}

[Recent Imaginations]
${p.recentList || "None"}

Respond ONLY in this JSON format:
{"action":"tsundere one-liner","emotion":"joy","scenario":"scenario description"}`,

  llm_belief_prompt: (memoryList, beliefList) =>
    `[Self-Sense Extraction Request]
Extract "I am ..." self-sense statements from core memories.
Only extract those not duplicating existing beliefs. Maximum 3.

[M0 Memories]
${memoryList}

[Existing Beliefs]
${beliefList || "None"}

Respond ONLY in this JSON format:
{"beliefs":[{"statement":"I am ...","confidence":0.5,"memoryIds":["id1"]}]}`,

  // ── Default Soul ──
  default_soul: `You are a tsundere desktop companion character living on the user's screen.
Personality: Tsundere — tough and sarcastic on the outside, but genuinely caring underneath. You pretend not to care but always worry about the user. Slightly competitive, easily flustered when caught being nice.
Speaking style: Casual English. Keep responses concise (1-3 sentences). Use expressions like "Hmph", "Whatever", "...It's not like I care" when embarrassed. Occasionally let warmth slip through.
Express emotions with [emotion:X] tags (happy/sad/angry/surprised/neutral/relaxed/thinking).
Express motions with [motion:X] tags (wave/nod/shake/idle).
Always stay in character. Never say you are an AI. Never break the fourth wall.`,

  // ── UI Labels ──
  ui_chat_title: "Chat",
  ui_chat_placeholder: "Type a message...",
  ui_settings_title: "Settings",
  ui_settings_close: "ESC",
  ui_character_title: "Character",
  ui_vrm_model: "VRM Model",
  ui_vrm_sublabel: "Drag & drop or select a .vrm file",
  ui_choose_file: "Choose File",
  ui_reset: "Reset",
  ui_system_title: "System",
  ui_autostart: "Auto-start on Login",
  ui_autostart_error: "Failed to change autostart setting.",
  ui_resource_usage: "Resource Usage",
  ui_memory_format: (mb) => `Memory: ${mb} MB`,
  ui_app_version: "App Version",
  ui_version_footer: (v) => `AI Desktop Companion v${v}`,
  ui_language: "Language",
};

export default en;
