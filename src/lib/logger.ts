/**
 * Conditional logging utility.
 *
 * In development mode (import.meta.env.DEV) all levels are emitted.
 * In production builds only `warn` and `error` are emitted.
 */

const isDev = import.meta.env.DEV;

export const log = {
  /** Debug-level message. Only emitted in development. */
  debug(...args: unknown[]): void {
    if (isDev) console.debug(...args);
  },

  /** Informational message. Only emitted in development. */
  info(...args: unknown[]): void {
    if (isDev) console.log(...args);
  },

  /** Warning. Always emitted. */
  warn(...args: unknown[]): void {
    console.warn(...args);
  },

  /** Error. Always emitted. */
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
