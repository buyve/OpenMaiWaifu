import type { LocaleStrings, SupportedLocale } from "./types";

export type { LocaleStrings, SupportedLocale };

const STORAGE_KEY = "companion_locale";
const DEFAULT_LOCALE: SupportedLocale = "en";

let _current: LocaleStrings | null = null;
let _currentCode: SupportedLocale = DEFAULT_LOCALE;

async function loadLocale(code: SupportedLocale): Promise<LocaleStrings> {
  switch (code) {
    case "ko": return (await import("./ko")).default;
    case "ja": return (await import("./ja")).default;
    case "zh-CN": return (await import("./zh-CN")).default;
    case "zh-TW": return (await import("./zh-TW")).default;
    case "es": return (await import("./es")).default;
    case "fr": return (await import("./fr")).default;
    case "de": return (await import("./de")).default;
    case "pt": return (await import("./pt")).default;
    case "ru": return (await import("./ru")).default;
    case "en":
    default:
      return (await import("./en")).default;
  }
}

/**
 * Initialize the i18n system. Must be called before render.
 * Reads the locale from localStorage and dynamically imports the locale file.
 */
export async function initI18n(): Promise<void> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLocale(stored)) {
      _currentCode = stored;
    }
  } catch {
    // localStorage unavailable
  }
  _current = await loadLocale(_currentCode);
}

/**
 * Get the current locale strings. Throws if called before initI18n().
 */
export function locale(): LocaleStrings {
  if (!_current) {
    throw new Error("i18n not initialized. Call initI18n() before accessing locale().");
  }
  return _current;
}

/**
 * Get the current locale code.
 */
export function getLocaleCode(): SupportedLocale {
  return _currentCode;
}

/**
 * Change the locale and persist to localStorage.
 * Caller should reload the page after calling this.
 */
export async function setLocale(code: SupportedLocale): Promise<void> {
  _current = await loadLocale(code);
  _currentCode = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // localStorage unavailable
  }
}

function isValidLocale(code: string): code is SupportedLocale {
  return ["en", "ko", "ja", "zh-CN", "zh-TW", "es", "fr", "de", "pt", "ru"].includes(code);
}

/** All supported locales with display names (always in native script). */
export const LOCALE_OPTIONS: { code: SupportedLocale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
];
