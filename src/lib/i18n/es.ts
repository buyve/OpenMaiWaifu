/**
 * Spanish locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const es: LocaleStrings = {
  ...en,

  imagination_day_names: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],

  island_bond_name: "Vínculo",
  island_tsundere_name: "Tsundere",
  island_curiosity_name: "Curiosidad Técnica",

  ui_chat_title: "Chat",
  ui_chat_placeholder: "Escribe un mensaje...",
  ui_settings_title: "Configuración",
  ui_character_title: "Personaje",
  ui_vrm_model: "Modelo VRM",
  ui_vrm_sublabel: "Arrastra o selecciona un archivo .vrm",
  ui_choose_file: "Elegir Archivo",
  ui_reset: "Restablecer",
  ui_system_title: "Sistema",
  ui_autostart: "Inicio automático al iniciar sesión",
  ui_autostart_error: "No se pudo cambiar la configuración de inicio automático.",
  ui_resource_usage: "Uso de Recursos",
  ui_memory_format: (mb) => `Memoria: ${mb} MB`,
  ui_app_version: "Versión",
  ui_version_footer: (v) => `AI Desktop Companion v${v}`,
  ui_language: "Idioma",
};

export default es;
