import { describe, expect, it } from 'vitest';
import { formatError } from '../error';

describe('formatError — sanity', () => {
  it('formats a known Tezos RPC error family', () => {
    const raw = JSON.stringify([{ id: 'proto.X.contract.balance_too_low', amount: '1000000', balance: '500000' }]);
    const out = formatError(new Error(`Taquito rejection: ${raw}`));
    expect(out.title).toBe('Insufficient funds');
    expect(out.detail).toMatch(/balance/);
  });

  it('formats an EIP-1193 user-rejected error by code', () => {
    const err: Error & { code?: number } = new Error('User denied');
    err.code = 4001;
    const out = formatError(err);
    expect(out.title).toBeTruthy();
    expect(out.raw).toBe('User denied');
  });

  it('formats a generic network error', () => {
    const out = formatError(new TypeError('Failed to fetch'));
    expect(out.title).toBeTruthy();
    expect(out.detail).toBeTruthy();
  });
});
