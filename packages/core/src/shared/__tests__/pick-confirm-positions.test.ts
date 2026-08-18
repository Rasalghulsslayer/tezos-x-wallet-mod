import { describe, it, expect } from 'vitest';
import { pickConfirmPositions } from '../seed';

// Every BIP-39 phrase length the import/create flows accept.
const WORD_COUNTS = [12, 15, 18, 21, 24] as const;

describe('pickConfirmPositions — proportional seed-confirmation challenge', () => {
  it('returns three 1-indexed positions within [1, wordCount]', () => {
    for (const n of WORD_COUNTS) {
      const positions = pickConfirmPositions(n);
      expect(positions).toHaveLength(3);
      for (const p of positions) {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(n);
      }
    }
  });

  it('positions are strictly increasing (three distinct words challenged)', () => {
    for (const n of WORD_COUNTS) {
      const [a, b, c] = pickConfirmPositions(n);
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
    }
  });

  it('positions index safely into a words array via words[p - 1] (UI convention)', () => {
    for (const n of WORD_COUNTS) {
      const words = Array.from({ length: n }, (_, i) => `word${i + 1}`);
      for (const p of pickConfirmPositions(n)) {
        // Both shells render "Word #p" and compare against words[p - 1].
        expect(words[p - 1]).toBe(`word${p}`);
      }
    }
  });

  it('scales with the phrase instead of stopping at word 11', () => {
    // The motivating bug: fixed [3, 7, 11] never verifies the tail of longer
    // phrases. Proportional positions must reach past word 11 from 15 words up.
    for (const n of [15, 18, 21, 24]) {
      const [, , last] = pickConfirmPositions(n);
      expect(last).toBeGreaterThan(11);
    }
  });

  it('pins the exact spread at ~20/50/80% for the supported lengths', () => {
    expect(pickConfirmPositions(12)).toEqual([2, 6, 9]);
    expect(pickConfirmPositions(15)).toEqual([3, 7, 12]);
    expect(pickConfirmPositions(18)).toEqual([3, 9, 14]);
    expect(pickConfirmPositions(21)).toEqual([4, 10, 16]);
    expect(pickConfirmPositions(24)).toEqual([4, 12, 19]);
  });
});
