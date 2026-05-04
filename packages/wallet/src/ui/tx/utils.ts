export function truncAddr(addr: string, len = 4): string {
  if (!addr) return '';
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len + 3)}…${addr.slice(-len)}`;
}
