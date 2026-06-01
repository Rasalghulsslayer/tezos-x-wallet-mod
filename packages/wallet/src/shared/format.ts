/** Truncate an address for display: "tz1aBcD...xYz1". */
export function shortAddr(addr: string, head = 6, tail = 4): string {
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
  const mutez = wei / 1_000_000_000_000n;   // 10^12 — wei → mutez
  return formatTokenAmount(mutez.toString(), 6);
}

/** Format 6-decimals USDC (raw uint256 hex) into a human string.
 *  @deprecated Use `formatTokenAmount(rawHex, asset.decimals)` instead.
 *  Kept during the CT1–CT4 migration; removed in CT4. */
export function formatUsdc(rawHex: string): string {
  return formatTokenAmount(rawHex, 6);
}

/** Pretty chain label ("0x1f094 · 127124"). */
export function chainLabel(chainId: string): string {
  if (!chainId) return '—';
  const dec = parseInt(chainId, 16);
  return Number.isNaN(dec) ? chainId : `${chainId} · ${dec}`;
}

/** Relative time suffix: "12s ago", "3m ago", "2h ago". */
export function timeAgo(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const s = Math.floor(diff / 1000);
  if (s < 60)     return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)     return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)     return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
