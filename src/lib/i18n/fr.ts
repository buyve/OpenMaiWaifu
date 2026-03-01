/**
 * French locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const fr: LocaleStrings = {
  ...en,

  imagination_day_names: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],

  island_bond_name: "Lien",
  island_tsundere_name: "Tsundere",
  island_curiosity_name: "Curiosité Technique",

  ui_chat_title: "Chat",
  ui_chat_placeholder: "Tapez un message...",
  ui_settings_title: "Paramètres",
  ui_character_title: "Personnage",
  ui_vrm_model: "Modèle VRM",
  ui_vrm_sublabel: "Glissez ou sélectionnez un fichier .vrm",
  ui_choose_file: "Choisir un Fichier",
  ui_reset: "Réinitialiser",
  ui_system_title: "Système",
  ui_autostart: "Démarrage automatique à la connexion",
  ui_autostart_error: "Impossible de modifier le paramètre de démarrage automatique.",
  ui_resource_usage: "Utilisation des Ressources",
  ui_memory_format: (mb) => `Mémoire : ${mb} Mo`,
  ui_app_version: "Version",
  ui_version_footer: (v) => `AI Desktop Companion v${v}`,
  ui_language: "Langue",
};

export default fr;
