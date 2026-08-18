/**
 * Canonical copy for a tz1 account's EVM alias that has not been resolved yet
 * (first unlock of the account, or offline). Every surface showing a missing
 * alias must render this — never an empty string masquerading as an address.
 */
export const RESOLVING_EVM_ADDRESS = 'Resolving EVM address…';

export function truncAddr(addr: string, len = 4): string {
  if (!addr) return '';
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len + 3)}…${addr.slice(-len)}`;
}
