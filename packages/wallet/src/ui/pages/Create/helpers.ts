/** Three positions in [1, n] roughly spread across the seed for the confirmation step. */
export function pickPositions(n: number): [number, number, number] {
  const a = Math.max(1, Math.floor(n * 0.2));
  const b = Math.max(a + 1, Math.floor(n * 0.5));
  const c = Math.max(b + 1, Math.floor(n * 0.8));
  return [a, b, c];
}
