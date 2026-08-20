import { describe, expect, it } from 'vitest';
import { parseTokenAmount, xtzToMutez, normalizeDecimalInput } from '../amounts';
import { formatTokenAmount } from '../format';

describe('parseTokenAmount — human decimal → base-units hex', () => {
  it('scales whole XTZ to 18 decimals (wei convention)', () => {
    expect(parseTokenAmount('1', 18)).toBe('0x' + (10n ** 18n).toString(16));
  });

  it('scales 1 mutez (0.000001 XTZ) exactly', () => {
    expect(parseTokenAmount('0.000001', 18)).toBe('0x' + (10n ** 12n).toString(16));
  });

  it('scales an ERC-20 amount by its own decimals', () => {
    expect(parseTokenAmount('1.5', 6)).toBe('0x' + 1_500_000n.toString(16));
  });

  it('truncates digits beyond the asset precision', () => {
    expect(parseTokenAmount('1.9999999', 6)).toBe('0x' + 1_999_999n.toString(16));
  });

  it('handles empty and zero inputs', () => {
    expect(parseTokenAmount('', 6)).toBe('0x0');
    expect(parseTokenAmount('0', 6)).toBe('0x0');
  });

  it('round-trips with formatTokenAmount', () => {
    const hex = parseTokenAmount('123.456789', 6);
    expect(formatTokenAmount(hex, 6)).toBe('123.456789');
  });
});

describe('xtzToMutez — human decimal XTZ → mutez bigint', () => {
  it('converts whole and fractional XTZ', () => {
    expect(xtzToMutez('1')).toBe(1_000_000n);
    expect(xtzToMutez('0.5')).toBe(500_000n);
    expect(xtzToMutez('0.000001')).toBe(1n);
  });

  it('truncates below the mutez quantum', () => {
    expect(xtzToMutez('1.9999999')).toBe(1_999_999n);
  });

  it('handles empty input', () => {
    expect(xtzToMutez('')).toBe(0n);
  });
});

describe('normalizeDecimalInput — typed amount, no float round-trip', () => {
  it('keeps sub-1e-6 amounts out of scientific notation', () => {
    expect(normalizeDecimalInput('0.0000001')).toBe('0.0000001');
  });

  it('strips leading and trailing zeros', () => {
    expect(normalizeDecimalInput('007.10')).toBe('7.1');
    expect(normalizeDecimalInput('1.000')).toBe('1');
  });

  it('normalizes bare-dot forms', () => {
    expect(normalizeDecimalInput('.5')).toBe('0.5');
    expect(normalizeDecimalInput('5.')).toBe('5');
  });

  it('keeps full precision beyond the float mantissa', () => {
    expect(normalizeDecimalInput('1.000000000000000001')).toBe('1.000000000000000001');
  });
});
