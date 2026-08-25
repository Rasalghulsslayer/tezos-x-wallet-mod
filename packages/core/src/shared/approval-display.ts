/**
 * Anti-phishing display helpers for the dApp approval surfaces. What an
 * approval screen shows IS the security boundary: a message that renders
 * differently from what is signed, or an origin whose scheme/port is hidden,
 * lets a hostile dApp dress up as a legitimate one. Shared by the router
 * (signature previews) and both shells' approval UIs.
 */

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
    // ASCII printable + tab/LF/CR, then U+00A0 upward: DEL (U+007F) and the
    // C1 control block (U+0080-U+009F) are invisible in a rendered preview,
    // so a payload carrying them is shown as raw hex instead.
    return /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How an origin should be shown in an approval header. Rendering only the
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

/**
 * Longest Micheline preview shown on an approval screen.
 *
 * A `%call_evm` argument carries EVM calldata as a hex string and can run to tens
 * of kilobytes — the live ceremony's deploy payloads are ~19 500 bytes. Rendering
 * that in a 420px popup helps nobody and blocks the buttons, so it is truncated
 * with the elision made visible.
 */
export const MICHELINE_PREVIEW_MAX = 512;

/**
 * Compact one-line Micheline for display ONLY.
 *
 * Never parsed back into an operation: the value the wallet signs is the object
 * the dApp sent, passed through untouched. This exists so the approval screen can
 * show what is in it without pretending to interpret it — the wallet has no ABI
 * for an arbitrary destination and inventing a friendly summary would be a
 * decoded claim it cannot stand behind.
 */
export function summariseMicheline(value: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    // Cyclic or otherwise unserialisable — page-supplied, so possible.
    return '(unrenderable Micheline)';
  }
  return text.length <= MICHELINE_PREVIEW_MAX
    ? text
    : `${text.slice(0, MICHELINE_PREVIEW_MAX)}… (${text.length} chars total)`;
}
