import { describe, expect, it } from 'vitest';
import { originDisplay, tryDecodeUtf8 } from '../helpers';

// Hex-encode a utf-8 string the way a dApp's personal_sign param arrives.
function hex(s: string): string {
  return '0x' + Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('tryDecodeUtf8 — decode for display (SEC-4)', () => {
  it('decodes plain printable text', () => {
    expect(tryDecodeUtf8(hex('Sign in to Example'))).toBe('Sign in to Example');
  });

  it('returns undefined for a message carrying a bidi override', () => {
    // U+202E flips the visible order so the rendered text can read as something
    // other than what is signed; refuse to present it as clean text.
    expect(tryDecodeUtf8(hex('transfer 1\u202e XTZ'))).toBeUndefined();
  });

  it('returns undefined for a message carrying a zero-width character', () => {
    expect(tryDecodeUtf8(hex('with\u200bdraw'))).toBeUndefined();
  });

  it('returns undefined for a message carrying a BOM / zero-width no-break', () => {
    expect(tryDecodeUtf8(hex('ok\ufeff'))).toBeUndefined();
  });

  it('returns undefined for non-hex or odd-length input', () => {
    expect(tryDecodeUtf8('0xzz')).toBeUndefined();
    expect(tryDecodeUtf8('0xabc')).toBeUndefined();
  });
});

describe('originDisplay — approval header (SEC-3)', () => {
  it('shows a clean host for https and marks it secure', () => {
    expect(originDisplay('https://app.example.com')).toEqual({
      title: 'app.example.com', secure: true, favLetter: 'A',
    });
  });

  it('spells out the scheme for a non-https origin and marks it insecure', () => {
    expect(originDisplay('http://victim.com')).toEqual({
      title: 'http://victim.com', secure: false, favLetter: 'V',
    });
  });

  it('keeps a non-standard port visible so look-alikes differ', () => {
    const d = originDisplay('http://victim.com:8443');
    expect(d.title).toBe('http://victim.com:8443');
    expect(d.secure).toBe(false);
  });
});
