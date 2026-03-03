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
  ui_model_builtin: "Встроенная",
  ui_model_active: "Активна",
  ui_model_delete: "Удалить",
  ui_model_add: "Добавить модель",
  ui_custom_animations_title: "Пользовательские анимации",
  ui_trigger_placeholder: "Когда воспроизводить? (напр. \"когда грустно\", \"иногда случайно\")",
  ui_add_animation: "Добавить анимацию",
  ui_trigger_parsing: "Анализ...",
  ui_trigger_emotion: "Эмоция",
  ui_trigger_event: "Событие",
  ui_trigger_ambient: "Случайно",
  ui_trigger_scheduled: "По расписанию",
  ui_trigger_idle: "Ожидание",
  ui_system_title: "Система",
  ui_autostart: "Автозапуск при входе",
  ui_autostart_error: "Не удалось изменить настройку автозапуска.",
  ui_resource_usage: "Использование Ресурсов",
  ui_memory_format: (mb) => `Память: ${mb} МБ`,
  ui_app_version: "Версия",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "Язык",
};

export default ru;
