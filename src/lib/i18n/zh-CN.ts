/**
 * Simplified Chinese locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const zhCN: LocaleStrings = {
  ...en,

  imagination_day_names: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],

  island_bond_name: "羁绊",
  island_tsundere_name: "傲娇",
  island_curiosity_name: "技术好奇心",

  ui_chat_title: "聊天",
  ui_chat_placeholder: "输入消息...",
  ui_settings_title: "设置",
  ui_character_title: "角色",
  ui_vrm_model: "VRM模型",
  ui_vrm_sublabel: "拖放或选择.vrm文件",
  ui_choose_file: "选择文件",
  ui_reset: "重置",
  ui_model_builtin: "内置",
  ui_model_active: "使用中",
  ui_model_delete: "删除",
  ui_model_add: "添加模型",
  ui_custom_animations_title: "自定义动画",
  ui_trigger_placeholder: "何时播放？（如：'开心时'、'偶尔随机'）",
  ui_add_animation: "添加动画",
  ui_trigger_parsing: "分析中...",
  ui_trigger_emotion: "情绪",
  ui_trigger_event: "事件",
  ui_trigger_ambient: "随机",
  ui_trigger_scheduled: "定时",
  ui_trigger_idle: "待机",
  ui_system_title: "系统",
  ui_autostart: "登录时自动启动",
  ui_autostart_error: "更改自动启动设置失败。",
  ui_resource_usage: "资源使用",
  ui_memory_format: (mb) => `内存: ${mb} MB`,
  ui_app_version: "版本",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "语言",
};

export default zhCN;
