/**
 * Dev-only logging.
 *
 * `devLog.*` forwards to `console.*` only in development builds and is a no-op
 * in production, so verbose / sensitive diagnostics (tx params, signed
 * payloads) never reach a release build's console.
 *
 * The dev flag prefers React Native's `__DEV__` global, which Metro/Hermes
 * define and set to `false` in a release build (and constant-fold, so the
 * guarded calls are dead-code-eliminated on device). On Vite (extension) and
 * Node (tests) `__DEV__` is absent, so we fall back to `process.env.NODE_ENV`,
 * which those toolchains statically replace. The `typeof` guard means
 * referencing the missing global never throws. Relying on `NODE_ENV` alone was
 * unsafe on Metro/Hermes: if it goes undefined there, the flag would default to
 * "dev" and leak signed payloads to the device log.
 */

declare const __DEV__: boolean;

const DEV: boolean =
  typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const devLog = {
  info: (...args: unknown[]): void => { if (DEV) console.info(...args); },
  warn: (...args: unknown[]): void => { if (DEV) console.warn(...args); },
  debug: (...args: unknown[]): void => { if (DEV) console.debug(...args); },
};
