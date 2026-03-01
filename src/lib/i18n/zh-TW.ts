/**
 * Traditional Chinese locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const zhTW: LocaleStrings = {
  ...en,

  imagination_day_names: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],

  island_bond_name: "羈絆",
  island_tsundere_name: "傲嬌",
  island_curiosity_name: "技術好奇心",

  ui_chat_title: "聊天",
  ui_chat_placeholder: "輸入訊息...",
  ui_settings_title: "設定",
  ui_character_title: "角色",
  ui_vrm_model: "VRM模型",
  ui_vrm_sublabel: "拖放或選擇.vrm檔案",
  ui_choose_file: "選擇檔案",
  ui_reset: "重設",
  ui_system_title: "系統",
  ui_autostart: "登入時自動啟動",
  ui_autostart_error: "更改自動啟動設定失敗。",
  ui_resource_usage: "資源使用",
  ui_memory_format: (mb) => `記憶體: ${mb} MB`,
  ui_app_version: "版本",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "語言",
};

export default zhTW;
