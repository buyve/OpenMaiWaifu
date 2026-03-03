/**
 * Japanese locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const ja: LocaleStrings = {
  ...en,

  // ── Overrides (translate incrementally) ──
  imagination_day_names: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"],

  island_bond_name: "絆",
  island_tsundere_name: "ツンデレ",
  island_curiosity_name: "技術的好奇心",

  ui_chat_title: "チャット",
  ui_chat_placeholder: "メッセージを入力...",
  ui_settings_title: "設定",
  ui_character_title: "キャラクター",
  ui_vrm_model: "VRMモデル",
  ui_vrm_sublabel: ".vrmファイルをドラッグまたは選択",
  ui_choose_file: "ファイル選択",
  ui_reset: "リセット",
  ui_model_builtin: "内蔵",
  ui_model_active: "使用中",
  ui_model_delete: "削除",
  ui_model_add: "モデル追加",
  ui_custom_animations_title: "カスタムアニメーション",
  ui_trigger_placeholder: "いつ再生しますか？（例：「嬉しい時」「たまにランダムで」）",
  ui_add_animation: "アニメーション追加",
  ui_trigger_parsing: "分析中...",
  ui_trigger_emotion: "感情",
  ui_trigger_event: "イベント",
  ui_trigger_ambient: "ランダム",
  ui_trigger_scheduled: "時間帯",
  ui_trigger_idle: "待機",
  ui_system_title: "システム",
  ui_autostart: "ログイン時に自動起動",
  ui_autostart_error: "自動起動設定の変更に失敗しました。",
  ui_resource_usage: "リソース使用量",
  ui_memory_format: (mb) => `メモリ: ${mb} MB`,
  ui_app_version: "バージョン",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "言語",
};

export default ja;
