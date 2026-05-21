/** Best-effort utf-8 decode for a hex-encoded signing payload. Returns
 *  undefined when the bytes don't look like printable text. */
export function tryDecodeUtf8(hex: string): string | undefined {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return undefined;
  }
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /^[\x09\x0a\x0d\x20-\x7e -￿]+$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

export function hostnameOf(origin: string): string {
  try { return new URL(origin).hostname; }
  catch { return origin; }
}
