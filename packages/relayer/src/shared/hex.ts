/**
 * Hex string helpers: hexToNum, numToHex.
 */

export function hexToNum(hex: string): number {
  return parseInt(hex, 16);
}

export function numToHex(n: number): string {
  return '0x' + n.toString(16);
}
