import { describe, expect, it } from 'vitest';
import { formatError, isAuthError } from '../error';

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

  it("classifies React Native's fetch failure string as network-unreachable", () => {
    const out = formatError(new TypeError('Network request failed'));
    expect(out.code).toBe('rpc-unreachable');
    expect(out.title).toBe('Network unreachable');
  });

  it('maps the 4900 code the relayer rpc helper attaches to network failures', () => {
    const err: Error & { code?: number } = new Error('Network error calling tez_getTezosEthereumAddress');
    err.code = 4900;
    const out = formatError(err);
    expect(out.title).toBe('Network unreachable');
  });
});

describe('isAuthError — only credential failures may clear a password field', () => {
  it('is true for wrong password and unlock throttle', () => {
    expect(isAuthError(new Error('Incorrect password'))).toBe(true);
    expect(isAuthError(new Error('Too many attempts. Try again in 5s.'))).toBe(true);
  });

  it('is false for network and internal failures', () => {
    expect(isAuthError(new TypeError('Network request failed'))).toBe(false);
    expect(isAuthError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isAuthError(new Error('Internal error'))).toBe(false);
  });
});
