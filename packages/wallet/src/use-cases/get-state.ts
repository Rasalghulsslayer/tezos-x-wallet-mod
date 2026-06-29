/**
 * getState: produces the current VaultState (empty / locked / unlocked-tezos
 * / unlocked-evm) for the popup. Resolves the EVM alias on first call after
 * a Tezos-account unlock and caches it via deps.evmAliasCache. Returns the
 * full accounts summary list so the popup can render the switcher.
 */

import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import type { Keyring } from '../background/keyring';
import type { VaultState } from '@tezosx/wallet-core/shared/messages';

export interface GetStateDeps {
  keyring:       Keyring;
  evmAliasCache: { value: string | null };
}

export async function getState(deps: GetStateDeps): Promise<VaultState> {
  const hasVault = await deps.keyring.hasVault();
  if (!hasVault) return { status: 'empty' };

  const unlocked = deps.keyring.getUnlocked();
  if (unlocked == null) return { status: 'locked' };

  const { account } = unlocked;
  const summaries   = (await deps.keyring.listAccountSummaries())
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  if (account.kind === 'tezos') {
    const alias = deps.evmAliasCache.value ?? await deriveEvmAlias(account.tz1);
    deps.evmAliasCache.value = alias;
    return {
      status:    'unlocked',
      kind:      'tezos',
      accountId: account.id,
      tz1:       account.tz1,
      evmAlias:  alias,
      accounts:  summaries,
    };
  }

  deps.evmAliasCache.value = account.address;
  return {
    status:    'unlocked',
    kind:      'evm',
    accountId: account.id,
    address:   account.address,
    accounts:  summaries,
  };
}
