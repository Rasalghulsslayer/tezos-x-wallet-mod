/**
 * Best-effort zeroization of secret byte buffers. JavaScript cannot stop the
 * VM or a crypto library from having made internal copies (and immutable
 * strings cannot be overwritten at all), but overwriting the bytes we do own
 * shortens the window a memory scraper has to catch them.
 */
export function wipe(...buffers: Array<Uint8Array | null | undefined>): void {
  for (const b of buffers) {
    if (b != null && b.byteLength > 0) b.fill(0);
  }
}

/** Constant-time byte comparison — the running time depends only on the
 *  length, never on where the first mismatch sits. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
