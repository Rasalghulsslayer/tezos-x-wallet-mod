/**
 * Amount parsing — the write direction of unit math: user-typed decimal
 * strings into base units, plus input normalization. The read direction
 * (base units → display string) lives in format.ts. Everything here is
 * BigInt/string only — a float round-trip corrupts small amounts (scientific
 * notation below 1e-6) and large ones (53-bit mantissa).
 *
 * Precision policy: digits beyond `decimals` are silently truncated, matching
 * the display-side floor of weiToXtz. The signing path keeps its own stricter
 * rule — the relayer's weiToMutezExact throws on sub-mutez remainders instead
 * of flooring.
 */

/**
 * Human decimal → 0x-prefixed base-units hex, scaled by `decimals`. XTZ always
 * uses 18 (the wei convention the relayer then converts ÷10^12 to mutez); an
 * ERC-20 uses its own token decimals, so the signed `transfer` amount matches
 * what the user typed rather than being over-scaled to 18.
 */
export function parseTokenAmount(human: string, decimals: number): string {
  const [whole, frac = ''] = human.trim().split('.');
  const padded = (whole + frac.padEnd(decimals, '0')).slice(0, whole.length + decimals);
  return '0x' + BigInt(padded || '0').toString(16);
}

/** Human decimal XTZ → mutez (6 decimals), truncating beyond the mutez quantum. */
export function xtzToMutez(xtz: string): bigint {
  const [whole, frac = ''] = xtz.trim().split('.');
  const mutezPart = (whole + frac.padEnd(6, '0')).slice(0, whole.length + 6);
  return BigInt(mutezPart || '0');
}

/**
 * Normalize a typed decimal without a float round-trip: Number() flips to
 * scientific notation below 1e-6 and the default locale formatting rounds to
 * 3 fraction digits — both misreport small amounts.
 */
export function normalizeDecimalInput(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '' || trimmed === '.') return String(Number(trimmed));
  const [w = '', f = ''] = trimmed.split('.');
  const whole = w.replace(/^0+(?=\d)/, '') || '0';
  const frac  = f.replace(/0+$/, '');
  return frac === '' ? whole : `${whole}.${frac}`;
}
