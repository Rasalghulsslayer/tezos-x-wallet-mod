import { describe, expect, it } from 'vitest';
import {
  decodeActivityCursor,
  encodeActivityCursor,
} from '../activity';

describe('activity cursor', () => {
  it('round-trips a typical payload', () => {
    const payload = { tezos: { lastId: 123456 }, evm: { block: 0x49b4c, index: 0 } };
    const encoded = encodeActivityCursor(payload);
    expect(typeof encoded).toBe('string');
    expect(decodeActivityCursor(encoded)).toEqual(payload);
  });

  it('round-trips a one-sided payload', () => {
    const payload = { tezos: { lastId: 1 } };
    expect(decodeActivityCursor(encodeActivityCursor(payload))).toEqual(payload);
  });

  it('returns {} for undefined', () => {
    expect(decodeActivityCursor(undefined)).toEqual({});
  });

  it('returns {} for empty string', () => {
    expect(decodeActivityCursor('')).toEqual({});
  });

  it('returns {} for garbage', () => {
    expect(decodeActivityCursor('not-base64!')).toEqual({});
  });
});
