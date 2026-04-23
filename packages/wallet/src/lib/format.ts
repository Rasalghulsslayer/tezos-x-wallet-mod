/** Truncate an address for display: "tz1aBcD...xYz1". */
export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Parse a 0x-prefixed hex wei string into a decimal XTZ string (6 decimals). */
export function weiToXtz(weiHex: string): string {
  if (!weiHex || weiHex === '0x0') return '0';
  const wei = BigInt(weiHex);
  const mutez = wei / 1_000_000_000_000n;   // 10^12 (same conversion as gateway)
  const whole = mutez / 1_000_000n;
  const frac  = mutez % 1_000_000n;
  return frac === 0n
    ? whole.toString()
    : `${whole.toString()}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
}

/** Format 6-decimals USDC (raw uint256 hex) into a human string. */
export function formatUsdc(rawHex: string): string {
  if (!rawHex || rawHex === '0x0' || rawHex === '0x') return '0';
  const raw   = BigInt(rawHex);
  const whole = raw / 1_000_000n;
  const frac  = raw % 1_000_000n;
  return frac === 0n
    ? whole.toString()
    : `${whole.toString()}.${frac.toString().padStart(6, '0').replace(/0+$/, '')}`;
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
