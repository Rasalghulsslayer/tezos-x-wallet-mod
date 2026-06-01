/**
 * Pure projection helpers for the Connections page. No I/O.
 */

import type { StoredSession } from '../../ports/session-store';
import type { AccountSummary } from '../../shared/messages';
import { shortAddr } from '../../shared/format';

export type ConnectionsFilter = 'all' | 'active';

export interface SessionAccountInfo {
  label:    string;
  address?: string;        // truncated; absent when missing
  missing:  boolean;       // true if the session's accountId no longer maps to a known account
}

export function filterSessions(
  sessions: StoredSession[],
  filter:   ConnectionsFilter,
  activeAccountId: string,
): StoredSession[] {
  if (filter === 'all') return sessions;
  return sessions.filter((s) => s.accountId === activeAccountId);
}

export function describeSessionAccount(
  session:  StoredSession,
  accounts: AccountSummary[],
): SessionAccountInfo {
  if (session.accountId == null || session.accountId === '') {
    return { label: 'Legacy session', missing: true };
  }
  const sorted = accounts.slice().sort((a, b) => a.createdAt - b.createdAt);
  const idx    = sorted.findIndex((a) => a.id === session.accountId);
  if (idx === -1) return { label: 'Removed account', missing: true };
  const acc    = sorted[idx];
  const label  = acc.label?.trim() != null && acc.label.trim().length > 0
    ? acc.label
    : `Account ${idx + 1}`;
  return { label, address: shortAddr(acc.primaryAddress), missing: false };
}
