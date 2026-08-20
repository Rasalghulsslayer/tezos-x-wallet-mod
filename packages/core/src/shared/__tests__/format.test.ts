import { describe, expect, it } from 'vitest';
import {
  dayGroupOf,
  formatBalanceDisplay,
  formatTokenAmount,
  mutezToXtz,
  shortAddr,
  timeAgo,
  weiToXtz,
} from '../format';

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

describe('shortAddr', () => {
  it('middle-truncates long addresses', () => {
    expect(shortAddr('tz1ZTKzWZshji8kW45Tg6WPDX7WVrBnRJ9SH')).toBe('tz1ZTK…J9SH');
  });

  it('keeps short strings intact', () => {
    expect(shortAddr('tz1short')).toBe('tz1short');
  });

  it('tolerates null and undefined (still-resolving address)', () => {
    expect(shortAddr(null)).toBe('');
    expect(shortAddr(undefined)).toBe('');
  });
});

describe('formatBalanceDisplay', () => {
  it('groups thousands and enforces the minimum fraction window', () => {
    expect(formatBalanceDisplay('1234.5')).toBe('1,234.50');
    expect(formatBalanceDisplay('1234567')).toBe('1,234,567.00');
  });

  it('truncates (never rounds) beyond the maximum fraction window', () => {
    expect(formatBalanceDisplay('0.12345678')).toBe('0.123456');
    expect(formatBalanceDisplay('1.9999999')).toBe('1.999999');
  });

  it('keeps small balances visible', () => {
    expect(formatBalanceDisplay('0.000001')).toBe('0.000001');
  });

  it('survives magnitudes beyond the float mantissa', () => {
    expect(formatBalanceDisplay('123456789012345678901.25'))
      .toBe('123,456,789,012,345,678,901.25');
  });

  it('passes non-numeric sentinels through unchanged', () => {
    expect(formatBalanceDisplay('—')).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-08-19T12:00:00Z').getTime();

  it('reads "just now" under a minute', () => {
    expect(timeAgo(now - 30_000, now)).toBe('just now');
  });

  it('scales through minutes, hours and days', () => {
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d ago');
  });

  it('falls back to a short date beyond a week', () => {
    const old = now - 30 * 86_400_000;
    expect(timeAgo(old, now)).toBe(
      new Date(old).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );
  });
});

describe('dayGroupOf', () => {
  // Local-noon reference keeps the calendar boundaries unambiguous.
  const noon = new Date(2026, 7, 19, 12, 0, 0).getTime();

  it('buckets on calendar midnight, not a sliding 24h window', () => {
    const yesterdayEvening = new Date(2026, 7, 18, 23, 0, 0).getTime();
    // 13h ago — inside a sliding window, but yesterday on the calendar.
    expect(dayGroupOf(yesterdayEvening, noon)).toBe('Yesterday');
  });

  it('classifies today and older items', () => {
    expect(dayGroupOf(new Date(2026, 7, 19, 0, 30, 0).getTime(), noon)).toBe('Today');
    expect(dayGroupOf(new Date(2026, 7, 17, 23, 0, 0).getTime(), noon)).toBe('Earlier');
  });
});
