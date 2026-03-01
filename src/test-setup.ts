import { initI18n, setLocale } from "./lib/i18n";

// Initialize i18n with ko locale before all tests.
// Tests were originally written with Korean keywords, and ko locale
// includes English keywords as fallback, so both work.
await initI18n();
await setLocale("ko");
