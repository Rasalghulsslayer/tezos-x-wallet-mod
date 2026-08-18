/**
 * ViewAccount — the stable presentation shape the screens consume, mapped from
 * the core VaultStateUnlocked / AccountSummary. Keeping this adapter lets the
 * UI read a uniform {tz1?, evmAlias?, address?} across runtimes while the vault
 * authority stays in core types. Identicons seed on the address (stable), not
 * the UUID id.
 */

import type { AccountSummary, VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';

export interface ViewAccount {
  id: string;
  kind: 'tezos' | 'evm';
  label: string;
  createdAt: number;
  tz1?: string;
  // null while the kernel alias of a tz1 is still resolving (first unlock, or
  // offline) — screens render a resolving placeholder and disable copy.
  evmAlias?: string | null;
  address?: string;
  identitySeed: string;   // the account's address — stable identicon seed
}

/** Map a summary (from the account list / switcher) to the view shape. */
export function summaryToView(s: AccountSummary): ViewAccount {
  const label = s.label != null && s.label.trim() !== '' ? s.label : '';
  return s.kind === 'tezos'
    ? { id: s.id, kind: 'tezos', label, createdAt: s.createdAt, tz1: s.primaryAddress, evmAlias: s.secondaryAddress ?? null, identitySeed: s.primaryAddress }
    : { id: s.id, kind: 'evm', label, createdAt: s.createdAt, address: s.primaryAddress, identitySeed: s.primaryAddress };
}

/** The active account, taken from the unlocked state's own fields (so it works
 *  even on a network-free boot where the summaries list is still empty). */
export function activeToView(state: VaultStateUnlocked): ViewAccount {
  const summary = state.accounts.find((a) => a.id === state.accountId);
  const label = summary?.label != null && summary.label.trim() !== '' ? summary.label : '';
  const createdAt = summary?.createdAt ?? 0;
  return state.kind === 'tezos'
    ? { id: state.accountId, kind: 'tezos', label, createdAt, tz1: state.tz1, evmAlias: state.evmAlias, identitySeed: state.tz1 }
    : { id: state.accountId, kind: 'evm', label, createdAt, address: state.address, identitySeed: state.address };
}
