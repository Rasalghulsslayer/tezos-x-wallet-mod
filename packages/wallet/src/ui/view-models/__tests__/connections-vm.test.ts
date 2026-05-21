import { describe, expect, it } from 'vitest';
import { filterSessions, describeSessionAccount } from '../connections-vm';
import type { StoredSession } from '../../../ports/session-store';
import type { AccountSummary } from '../../../shared/messages';

const session = (origin: string, accountId: string | undefined): StoredSession => ({
  origin,
  accountId,
  tz1Address:  '',
  evmAlias:    '',
  chainId:     '0x1',
  connectedAt: 0,
});

const tezosSummary = (id: string, createdAt: number, label?: string): AccountSummary => ({
  id, kind: 'tezos', label,
  primaryAddress:   `tz1Account${id}EndPad000000000000000000`,
  secondaryAddress: `0xAlias${id}00000000000000000000000000000000`,
  createdAt,
});

describe('filterSessions', () => {
  it('returns every session when filter is "all"', () => {
    const sessions = [session('a.com', 'A'), session('b.com', 'B'), session('c.com', 'C')];
    expect(filterSessions(sessions, 'all', 'A')).toHaveLength(3);
  });

  it('keeps only the sessions bound to the active account when filter is "active"', () => {
    const sessions = [session('a.com', 'A'), session('b.com', 'B'), session('c.com', 'A')];
    const out      = filterSessions(sessions, 'active', 'A');
    expect(out.map(s => s.origin)).toEqual(['a.com', 'c.com']);
  });

  it('returns an empty list when no session matches the active account', () => {
    const sessions = [session('a.com', 'A'), session('b.com', 'B')];
    expect(filterSessions(sessions, 'active', 'Z')).toEqual([]);
  });
});

describe('describeSessionAccount', () => {
  const accounts = [
    tezosSummary('a', 100),                    // → Account 1 (no label)
    tezosSummary('b', 200, 'Trading'),         // → Trading
    tezosSummary('c', 300),                    // → Account 3
  ];

  it('returns label or fallback + truncated address when the account is known', () => {
    expect(describeSessionAccount(session('x', 'b'), accounts).label).toBe('Trading');
    expect(describeSessionAccount(session('x', 'a'), accounts).label).toBe('Account 1');
    expect(describeSessionAccount(session('x', 'c'), accounts).label).toBe('Account 3');
    const info = describeSessionAccount(session('x', 'a'), accounts);
    expect(info.address).toMatch(/^tz1/);
    expect(info.missing).toBe(false);
  });

  it('flags a removed account', () => {
    const info = describeSessionAccount(session('x', 'gone'), accounts);
    expect(info.missing).toBe(true);
    expect(info.label).toBe('Removed account');
    expect(info.address).toBeUndefined();
  });

  it('flags a legacy session with no accountId', () => {
    const info = describeSessionAccount(session('x', undefined), accounts);
    expect(info.missing).toBe(true);
    expect(info.label).toBe('Legacy session');
  });
});
