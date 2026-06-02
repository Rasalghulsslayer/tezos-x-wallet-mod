/**
 * Dev-only logging.
 *
 * `devLog.*` forwards to `console.*` only in development builds and is a no-op
 * in production. Vite statically replaces `import.meta.env.DEV`, so the calls
 * (and the strings they carry — including tx params / signed payloads) are
 * dead-code-eliminated from the production bundle.
 *
 * Use `devLog` for verbose / sensitive diagnostics. Keep `console.error` for
 * genuine failures that should surface in production too.
 */

const DEV: boolean = import.meta.env.DEV;

export const devLog = {
  info: (...args: unknown[]): void => { if (DEV) console.info(...args); },
  warn: (...args: unknown[]): void => { if (DEV) console.warn(...args); },
  debug: (...args: unknown[]): void => { if (DEV) console.debug(...args); },
};
