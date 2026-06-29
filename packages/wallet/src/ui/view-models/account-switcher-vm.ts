/**
 * AccountSwitcherVM: projects the unlocked vault's accounts into rows for the
 * popover. Active goes to the top; others sorted by createdAt ASC. The
 * "Account N" fallback is computed from the createdAt-ASC position so a
 * renamed account doesn't shift its peers' default labels.
 */

import type { VaultStateUnlocked } from '@tezosx/wallet-core/shared/messages';
import type { AccountId } from '@tezosx/wallet-core/domain/account';
import { shortAddr } from '@tezosx/wallet-core/shared/format';

export interface AccountRowVM {
  id:                AccountId;
  identitySeed:      string;
  displayLabel:      string;
  kindLabel:         'Michelson' | 'EVM';
  primaryAddress:    string;             // truncated
  secondaryAddress?: string;             // truncated; Tezos only
  isActive:          boolean;
}

export interface AccountSwitcherVM {
  active: AccountRowVM;
  others: AccountRowVM[];
}

export function accountSwitcherVM(state: VaultStateUnlocked): AccountSwitcherVM {
  const sorted = state.accounts.slice().sort((a, b) => a.createdAt - b.createdAt);
  const rows: AccountRowVM[] = sorted.map((acc, idx) => ({
    id:                acc.id,
    identitySeed:      acc.primaryAddress,
    displayLabel:      acc.label?.trim() && acc.label.length > 0 ? acc.label : `Account ${idx + 1}`,
    kindLabel:         acc.kind === 'tezos' ? 'Michelson' : 'EVM',
    primaryAddress:    shortAddr(acc.primaryAddress),
    secondaryAddress:  acc.secondaryAddress != null ? shortAddr(acc.secondaryAddress) : undefined,
    isActive:          acc.id === state.accountId,
  }));
  const active = rows.find(r => r.isActive) ?? rows[0];
  const others = rows.filter(r => r.id !== active.id);
  return { active, others };
}
