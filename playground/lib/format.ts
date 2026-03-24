export function formatAddress(addr: string): string {
  if (addr.length < 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function formatBalance(wei: bigint): string {
  const tez = Number(wei) / 1e18;
  return `${tez.toFixed(4)} tez`;
}

export function formatTxHash(hash: string): string {
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}
