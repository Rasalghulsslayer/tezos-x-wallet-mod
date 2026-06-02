/**
 * Dev-only logging for the relayer.
 *
 * `devLog.*` forwards to `console.*` only outside production and is a no-op in
 * production builds, so verbose / sensitive diagnostics (tx to/value/data, op
 * hashes, proxied RPC params) never reach a production console.
 *
 * `DEV` is resolved at build time: Vite (when the relayer source is bundled
 * into the wallet) and esbuild (the standalone IIFE / extension builds) both
 * statically replace `process.env.NODE_ENV`. In a context where `process` is
 * not defined at all (e.g. a bundle that does not inject it), the access throws
 * and we fall back to `false` — i.e. silent, which is the safe default.
 *
 * Keep `console.error` for genuine failures that should surface in production.
 */

function detectDev(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

const DEV: boolean = detectDev();

export const devLog = {
  info: (...args: unknown[]): void => { if (DEV) console.info(...args); },
  warn: (...args: unknown[]): void => { if (DEV) console.warn(...args); },
  debug: (...args: unknown[]): void => { if (DEV) console.debug(...args); },
};
