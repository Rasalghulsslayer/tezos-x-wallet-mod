/**
 * getState: produces the current VaultState (empty / locked / unlocked-tezos
 * / unlocked-evm) for the shells. Deliberately network-free: unlocking is a
 * local vault decrypt and its state read must never be gated on an RPC. The
 * EVM alias of a tz1 account is an immutable kernel mapping resolved in the
 * background (EvmAliasCache.backfill, kicked by the shells / sw-wiring);
 * until it lands the state carries `evmAlias: null` and summaries without
 * `secondaryAddress`, and the UI renders a resolving placeholder.
 */

import type { Keyring } from '../background/keyring';
import type { VaultState } from '../shared/messages';
import type { EvmAliasCache } from '../shared/evm-alias-cache';

export interface GetStateDeps {
  keyring:    Keyring;
  aliasCache: EvmAliasCache;
}

export async function getState(deps: GetStateDeps): Promise<VaultState> {
  const hasVault = await deps.keyring.hasVault();
  if (!hasVault) return { status: 'empty' };

  const unlocked = deps.keyring.getUnlocked();
  if (unlocked == null) return { status: 'locked' };

  const { account } = unlocked;
  const summaries   = deps.keyring.listAccountSummaries()
    .map((s) => s.kind === 'tezos'
      ? { ...s, secondaryAddress: deps.aliasCache.get(s.primaryAddress) ?? undefined }
      : s)
    .sort((a, b) => a.createdAt - b.createdAt);

  const hasSeed = deps.keyring.hasWalletSeed();

  if (account.kind === 'tezos') {
    return {
      status:    'unlocked',
      kind:      'tezos',
      accountId: account.id,
      tz1:       account.tz1,
      evmAlias:  deps.aliasCache.get(account.tz1),
      accounts:  summaries,
      hasSeed,
    };
  }

  return {
    status:    'unlocked',
    kind:      'evm',
    accountId: account.id,
    address:   account.address,
    accounts:  summaries,
    hasSeed,
  };
}
