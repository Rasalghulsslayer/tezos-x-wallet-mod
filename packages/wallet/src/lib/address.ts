/** Native runtime of a recipient address. */
export type DestRuntime = 'l1' | 'l2' | null;

const TZ_ADDR_RE  = /^(tz[1234]|KT1)[a-zA-Z0-9]{33}$/;
const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function detectRuntime(addr: string): DestRuntime {
  const trimmed = addr.trim();
  if (trimmed.length === 0)      return null;
  if (TZ_ADDR_RE.test(trimmed))  return 'l1';
  if (EVM_ADDR_RE.test(trimmed)) return 'l2';
  return null;
}

export function isValidAddress(addr: string): boolean {
  return detectRuntime(addr) !== null;
}
