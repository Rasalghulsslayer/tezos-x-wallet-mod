import { describe, expect, it } from 'vitest';
import { wipe } from '../wipe';

describe('wipe', () => {
  it('zero-fills every given buffer', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([255]);
    wipe(a, b);
    expect([...a]).toEqual([0, 0, 0]);
    expect([...b]).toEqual([0]);
  });

  it('tolerates null, undefined and empty buffers', () => {
    expect(() => wipe(null, undefined, new Uint8Array(0))).not.toThrow();
  });
});
