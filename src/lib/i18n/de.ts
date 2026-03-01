/**
 * German locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const de: LocaleStrings = {
  ...en,

  imagination_day_names: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],

  island_bond_name: "Bindung",
  island_tsundere_name: "Tsundere",
  island_curiosity_name: "Technische Neugier",

  ui_chat_title: "Chat",
  ui_chat_placeholder: "Nachricht eingeben...",
  ui_settings_title: "Einstellungen",
  ui_character_title: "Charakter",
  ui_vrm_model: "VRM-Modell",
  ui_vrm_sublabel: "Ziehe eine .vrm-Datei hierher oder wähle sie aus",
  ui_choose_file: "Datei Wählen",
  ui_reset: "Zurücksetzen",
  ui_system_title: "System",
  ui_autostart: "Automatischer Start bei Anmeldung",
  ui_autostart_error: "Änderung der Autostart-Einstellung fehlgeschlagen.",
  ui_resource_usage: "Ressourcennutzung",
  ui_memory_format: (mb) => `Speicher: ${mb} MB`,
  ui_app_version: "Version",
  ui_version_footer: (v) => `AI Desktop Companion v${v}`,
  ui_language: "Sprache",
};

export default de;
