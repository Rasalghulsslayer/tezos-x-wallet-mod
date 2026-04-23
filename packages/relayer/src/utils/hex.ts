/**
 * Parse a 0x-prefixed hex string into a decimal number.
 * Returns NaN if the input is not a valid hex string.
 */
export function hexToNum(hex: string): number {
  return parseInt(hex, 16);
}

/**
 * Format a decimal number as a 0x-prefixed hex string.
 */
export function numToHex(n: number): string {
  return '0x' + n.toString(16);
}
