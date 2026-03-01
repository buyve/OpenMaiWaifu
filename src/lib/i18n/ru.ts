/**
 * Russian locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const ru: LocaleStrings = {
  ...en,

  imagination_day_names: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],

  island_bond_name: "Связь",
  island_tsundere_name: "Цундэрэ",
  island_curiosity_name: "Техническое любопытство",

  ui_chat_title: "Чат",
  ui_chat_placeholder: "Введите сообщение...",
  ui_settings_title: "Настройки",
  ui_character_title: "Персонаж",
  ui_vrm_model: "VRM Модель",
  ui_vrm_sublabel: "Перетащите или выберите файл .vrm",
  ui_choose_file: "Выбрать Файл",
  ui_reset: "Сбросить",
  ui_system_title: "Система",
  ui_autostart: "Автозапуск при входе",
  ui_autostart_error: "Не удалось изменить настройку автозапуска.",
  ui_resource_usage: "Использование Ресурсов",
  ui_memory_format: (mb) => `Память: ${mb} МБ`,
  ui_app_version: "Версия",
  ui_version_footer: (v) => `AI Desktop Companion v${v}`,
  ui_language: "Язык",
};

export default ru;
