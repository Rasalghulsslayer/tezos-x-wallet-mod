/**
 * getState: produces the current VaultState (empty / locked / unlocked) for
 * the popup. Resolves the EVM alias on first call after unlock and caches
 * it via deps.evmAliasCache.
 */

import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import type { Keyring } from '../background/keyring';
import type { VaultState } from '../shared/messages';

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

  if (account.kind === 'tezos') {
    const alias = deps.evmAliasCache.value ?? await deriveEvmAlias(account.tz1);
    deps.evmAliasCache.value = alias;
    return { status: 'unlocked', tz1: account.tz1, evmAlias: alias };
  }

  // EVM-native account: tz1 is empty; evmAlias is the account's own address.
  // VaultState will gain an account-kind discriminant in W4c.
  deps.evmAliasCache.value = account.address;
  return { status: 'unlocked', tz1: '', evmAlias: account.address };
}
