import { describe, it, expect } from 'vitest';
import { rlpEncode, type RlpInput } from '../rlp';

// Canonical RLP examples from the Ethereum spec (Yellow Paper Appendix B /
// ethereum.org RLP page). Expected outputs are published constants, NOT values
// produced by this encoder.

const toHex = (b: Uint8Array): string =>
  Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const rlpHex = (input: RlpInput): string => toHex(rlpEncode(input));

describe('rlpEncode — canonical Ethereum RLP vectors', () => {
  it('the empty string → 0x80', () => {
    expect(rlpHex(new Uint8Array([]))).toBe('80');
  });

  it('the byte string "dog" → 0x83646f67', () => {
    expect(rlpHex(bytes('dog'))).toBe('83646f67');
  });

  it('the list ["cat","dog"] → 0xc88363617483646f67', () => {
    expect(rlpHex([bytes('cat'), bytes('dog')])).toBe('c88363617483646f67');
  });

  it('the empty list → 0xc0', () => {
    expect(rlpHex([])).toBe('c0');
  });

  it('the single byte 0x00 encodes as itself', () => {
    expect(rlpHex(new Uint8Array([0x00]))).toBe('00');
  });

  it('the single byte 0x0f encodes as itself', () => {
    expect(rlpHex(new Uint8Array([0x0f]))).toBe('0f');
  });

  it('the integer 1024 (0x0400) → 0x820400', () => {
    expect(rlpHex(new Uint8Array([0x04, 0x00]))).toBe('820400');
  });

  it('the set-theoretic three [ [], [[]], [ [], [[]] ] ] → 0xc7c0c1c0c3c0c1c0', () => {
    const set: RlpInput = [[], [[]], [[], [[]]]];
    expect(rlpHex(set)).toBe('c7c0c1c0c3c0c1c0');
  });

  it('a 56-byte string crosses into the long-string form with a 0xb838 prefix', () => {
    // The spec's long-string example: a 56-char ASCII string. 56 ≥ 56 ⇒ the
    // length itself is length-prefixed: 0xb7+1 = 0xb8, then 0x38 (=56).
    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipisicing elit';
    expect(lorem.length).toBe(56);
    const expected = 'b838' + toHex(bytes(lorem));
    expect(rlpHex(bytes(lorem))).toBe(expected);
    expect(rlpHex(bytes(lorem)).startsWith('b838')).toBe(true);
  });

  it('a 55-byte string stays in the short-string form (0xb7 boundary)', () => {
    const s = 'a'.repeat(55);
    // 55 < 56 ⇒ single length byte 0x80+55 = 0xb7.
    expect(rlpHex(bytes(s)).startsWith('b7')).toBe(true);
  });
});
