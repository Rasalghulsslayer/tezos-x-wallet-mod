import { Buffer } from 'buffer';

/**
 * Taquito's signer bundle reads `Buffer` off `globalThis` in several places
 * (base58 encoding, blake2b, sapling helpers). In Vite's dev server the
 * `buffer` polyfill module is available but not auto-installed on the global
 * scope — we do it explicitly here, once per entry point.
 */
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
