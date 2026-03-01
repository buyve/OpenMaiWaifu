/**
 * Portuguese locale — Phase 2 stub.
 * Starts as a copy of English; translate incrementally.
 */
import type { LocaleStrings } from "./types";
import en from "./en";

const pt: LocaleStrings = {
  ...en,

  imagination_day_names: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],

  island_bond_name: "Vínculo",
  island_tsundere_name: "Tsundere",
  island_curiosity_name: "Curiosidade Técnica",

  ui_chat_title: "Chat",
  ui_chat_placeholder: "Digite uma mensagem...",
  ui_settings_title: "Configurações",
  ui_character_title: "Personagem",
  ui_vrm_model: "Modelo VRM",
  ui_vrm_sublabel: "Arraste ou selecione um arquivo .vrm",
  ui_choose_file: "Escolher Arquivo",
  ui_reset: "Redefinir",
  ui_system_title: "Sistema",
  ui_autostart: "Iniciar automaticamente ao fazer login",
  ui_autostart_error: "Falha ao alterar a configuração de inicialização automática.",
  ui_resource_usage: "Uso de Recursos",
  ui_memory_format: (mb) => `Memória: ${mb} MB`,
  ui_app_version: "Versão",
  ui_version_footer: (v) => `OpenMaiWaifu v${v}`,
  ui_language: "Idioma",
};

export default pt;
