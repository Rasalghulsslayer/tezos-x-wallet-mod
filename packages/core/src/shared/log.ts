/**
 * Dev-only logging.
 *
 * `devLog.*` forwards to `console.*` only in development builds and is a no-op
 * in production. The dev flag is read from `process.env.NODE_ENV`, which every
 * consumer's bundler statically replaces — Vite (extension) and Metro/Hermes
 * (mobile), as well as Node (tests). Vite/Metro fold it to a literal, so in a
 * production build the calls (and the strings they carry — including tx params /
 * signed payloads) are dead-code-eliminated. (We avoid `import.meta.env`, which
 * Metro does not parse, and `__DEV__`, which the extension's Vite build lacks.)
 *
 * Use `devLog` for verbose / sensitive diagnostics. Keep `console.error` for
 * genuine failures that should surface in production too.
 */

const DEV: boolean = process.env.NODE_ENV !== 'production';

export const devLog = {
  info: (...args: unknown[]): void => { if (DEV) console.info(...args); },
  warn: (...args: unknown[]): void => { if (DEV) console.warn(...args); },
  debug: (...args: unknown[]): void => { if (DEV) console.debug(...args); },
};
