/**
 * readState: a network-free state read for the Gate. Unlike core getState — which
 * derives the EVM alias over the network and so blocks the unlock transition on a
 * (sometimes slow) previewnet RPC — this reads only the keyring (in-memory unlock
 * state) and the MMKV vault presence. Unlock is therefore instant; Home resolves
 * the alias and balances asynchronously. The EVM alias is display-only and must
 * never gate unlock.
 */

import type { VaultState } from '@tezosx/wallet-core/shared/messages';
import { keyring, evmAliasCache } from './wiring';

export async function readState(): Promise<VaultState> {
  if (!(await keyring.hasVault())) return { status: 'empty' };

  const unlocked = keyring.getUnlocked();
  if (unlocked == null) return { status: 'locked' };

  const { account } = unlocked;
  if (account.kind === 'tezos') {
    return {
      status:    'unlocked',
      kind:      'tezos',
      accountId: account.id,
      tz1:       account.tz1,
      evmAlias:  evmAliasCache.value ?? '', // '' = not resolved yet; Home fills it in
      accounts:  [],                         // account switcher is out of this milestone
    };
  }
  return {
    status:    'unlocked',
    kind:      'evm',
    accountId: account.id,
    address:   account.address,
    accounts:  [],
  };
}
