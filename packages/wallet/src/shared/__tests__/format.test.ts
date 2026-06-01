import { describe, expect, it } from 'vitest';
import { formatTokenAmount, formatUsdc, mutezToXtz, weiToXtz } from '../format';

describe('formatTokenAmount', () => {
  it('handles 6 decimals (USDC pattern)', () => {
    expect(formatTokenAmount('1000000', 6)).toBe('1');
    expect(formatTokenAmount('1500000', 6)).toBe('1.5');
    expect(formatTokenAmount('123', 6)).toBe('0.000123');
    expect(formatTokenAmount('0', 6)).toBe('0');
  });

  it('handles 18 decimals (WXTZ pattern)', () => {
    expect(formatTokenAmount('1000000000000000000', 18)).toBe('1');
    expect(formatTokenAmount('1500000000000000000', 18)).toBe('1.5');
  });

  it('handles arbitrary precision', () => {
    expect(formatTokenAmount('12345', 5)).toBe('0.12345');
    expect(formatTokenAmount('100000', 5)).toBe('1');
  });

  it('handles 0 decimals (some governance tokens)', () => {
    expect(formatTokenAmount('42', 0)).toBe('42');
  });

  it('strips trailing zeros in the fractional part', () => {
    expect(formatTokenAmount('1100000', 6)).toBe('1.1');
    expect(formatTokenAmount('1230000', 6)).toBe('1.23');
  });

  it('accepts hex input', () => {
    expect(formatTokenAmount('0x' + (10n ** 6n).toString(16), 6)).toBe('1');
  });

  it('returns "0" for empty / zero inputs', () => {
    expect(formatTokenAmount('', 6)).toBe('0');
    expect(formatTokenAmount('0x', 6)).toBe('0');
    expect(formatTokenAmount('0x0', 6)).toBe('0');
  });
});

describe('legacy wrappers (regression)', () => {
  it('formatUsdc behaves identically to the previous 6-decimal implementation', () => {
    expect(formatUsdc('0x' + (250n * 10n ** 6n).toString(16))).toBe('250');
    expect(formatUsdc('0x' + (12345n * 10n ** 3n).toString(16))).toBe('12.345');
  });

  it('mutezToXtz handles the L1 6-decimal case', () => {
    expect(mutezToXtz('1000000')).toBe('1');
    expect(mutezToXtz('1500000')).toBe('1.5');
    expect(mutezToXtz('0')).toBe('0');
  });

  it('weiToXtz truncates sub-mutez precision (kernel quantum)', () => {
    expect(weiToXtz('0x' + (10n ** 18n).toString(16))).toBe('1');
    expect(weiToXtz('0x' + (15n * 10n ** 17n).toString(16))).toBe('1.5');
    // Sub-mutez wei (< 10^12) rounds down to 0 — preserves pre-CT1 display polish.
    expect(weiToXtz('0x' + (123n * 10n ** 9n).toString(16))).toBe('0');
  });
});
