/**
 * Presentation helpers — the mobile design's formatting utilities (mirrors
 * mobile/lib.jsx). Pure, display-only. `XTZ` is the ꜩ ligature the whole UI
 * uses for the native asset.
 */

export const XTZ = 'ꜩ'; // ꜩ

/** Middle-truncate an address: first `n` chars … last 4. */
export function truncAddr(addr: string | undefined | null, n = 6): string {
  if (addr == null || addr.length <= n * 2 + 2) return addr ?? '';
  return `${addr.slice(0, n)}…${addr.slice(-4)}`;
}

/** Format a decimal amount with grouped thousands and a fraction window. */
export function fmtXtz(n: string | number, min = 2, max = 6): string {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (!isFinite(num)) return '—';
  return num.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** Relative time: "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function timeAgo(ts: number, nowMs: number = Date.now()): string {
  const s = Math.floor((nowMs - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Runtime → accent family for badges/pills. */
export function runtimeAccent(runtime: 'l1' | 'l2' | 'cross'): 'purple' | 'cyan' {
  return runtime === 'l2' || runtime === 'cross' ? 'cyan' : 'purple';
}

/** tz1/KT1 → 'l1', 0x… → 'l2', otherwise null (for Send routing). */
export function detectRuntime(addr: string): 'l1' | 'l2' | null {
  const a = (addr || '').trim();
  if (/^(tz1|tz2|tz3|KT1)/.test(a)) return 'l1';
  if (/^0x[0-9a-fA-F]{6,}/.test(a)) return 'l2';
  return null;
}
