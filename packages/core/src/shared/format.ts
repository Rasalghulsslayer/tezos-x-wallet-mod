import { WEI_PER_MUTEZ } from '@tezosx/relayer/constants';

/** Truncate an address for display: "tz1aBcD...xYz1". Null-tolerant so a
 *  still-resolving address renders as an empty slot, not a crash. */
export function shortAddr(addr: string | null | undefined, head = 6, tail = 4): string {
  if (addr == null) return '';
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * Parse a raw uint256 amount (decimal string or 0x-prefixed hex) into a
 * decimal human string at the given decimals precision. Trailing zeros in
 * the fractional part are stripped.
 */
export function formatTokenAmount(raw: string, decimals: number): string {
  if (!raw || raw === '0' || raw === '0x0' || raw === '0x') return '0';
  const value = BigInt(raw);
  if (decimals === 0) return value.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole   = value / divisor;
  const frac    = value % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${fracStr}`;
}

/** Mutez (L1 RPC format, 6 decimals) → decimal XTZ string. */
export function mutezToXtz(mutez: string): string {
  return formatTokenAmount(mutez, 6);
}

/**
 * 0x-prefixed hex wei → decimal XTZ string. Truncates to 6-decimal precision
 * (sub-mutez wei is rounded down — matches the kernel's mutez quantum and the
 * existing UI's display polish).
 */
export function weiToXtz(weiHex: string): string {
  if (!weiHex || weiHex === '0x0' || weiHex === '0x') return '0';
  const wei   = BigInt(weiHex);
  const mutez = wei / WEI_PER_MUTEZ;
  return formatTokenAmount(mutez.toString(), 6);
}

/**
 * Grouped display of an exact decimal string: en-US thousands separators and
 * a [min, max] fraction window, truncating (never rounding) beyond max. Pure
 * string work — no parseFloat, so precision survives any magnitude. A
 * non-numeric input (a '—' placeholder) passes through unchanged; the caller
 * owns its sentinels.
 */
export function formatBalanceDisplay(decimal: string, min = 2, max = 6): string {
  if (!/^\d+(\.\d+)?$/.test(decimal)) return decimal;
  const [rawWhole = '0', rawFrac = ''] = decimal.split('.');
  const whole   = rawWhole.replace(/^0+(?=\d)/, '') || '0';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac    = rawFrac.slice(0, max).replace(/0+$/, '');
  const padded  = frac.length < min ? frac.padEnd(min, '0') : frac;
  return padded === '' ? grouped : `${grouped}.${padded}`;
}

/** Pretty chain label ("0x1f094 · 127124"). */
export function chainLabel(chainId: string): string {
  if (!chainId) return '—';
  const dec = parseInt(chainId, 16);
  return Number.isNaN(dec) ? chainId : `${chainId} · ${dec}`;
}

/** Relative time: "just now", "5m ago", "3h ago", "2d ago", then a short
 *  date beyond a week. `nowMs` is injectable for tests. */
export function timeAgo(tsMs: number, nowMs: number = Date.now()): string {
  const s = Math.floor((nowMs - tsMs) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(tsMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier';

/** Calendar-day bucket for activity grouping: "Today" starts at local
 *  midnight, not 24 sliding hours. */
export function dayGroupOf(tsMs: number, nowMs: number): DayGroup {
  const dayMs        = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(nowMs).setHours(0, 0, 0, 0);
  if (tsMs >= startOfToday)         return 'Today';
  if (tsMs >= startOfToday - dayMs) return 'Yesterday';
  return 'Earlier';
}
