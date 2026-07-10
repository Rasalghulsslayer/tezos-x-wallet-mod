// Bidi overrides / embeddings / isolates and zero-width characters: invisible
// or direction-flipping codepoints that let a decoded message read as
// something other than what is signed. If a payload contains any, we refuse to
// present it as clean text (the UI shows the raw hex instead).
const DECEPTIVE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

/** Best-effort utf-8 decode for a hex-encoded signing payload. Returns
 *  undefined when the bytes don't look like plain, non-deceptive text. */
export function tryDecodeUtf8(hex: string): string | undefined {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return undefined;
  }
  try {
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (DECEPTIVE_CHARS.test(text)) return undefined;
    return /^[\x09\x0a\x0d\x20-\x7e -￿]+$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How an origin should be shown in the approval header. Rendering only the
 * hostname hid the scheme and port, so `http://victim.com` and
 * `http://victim.com:8443` looked identical to the legitimate
 * `https://victim.com`. For an https origin we keep the clean `host[:port]`;
 * for anything else we show the full `scheme://host[:port]` so an insecure or
 * odd-port origin is visibly different, and `secure` drives the lock/warning.
 */
export function originDisplay(origin: string): { title: string; secure: boolean; favLetter: string } {
  try {
    const u = new URL(origin);
    const secure = u.protocol === 'https:';
    return {
      title:     secure ? u.host : `${u.protocol}//${u.host}`,
      secure,
      favLetter: (u.hostname[0] ?? '?').toUpperCase(),
    };
  } catch {
    return { title: origin, secure: false, favLetter: (origin[0] ?? '?').toUpperCase() };
  }
}
