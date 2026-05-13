/**
 * getState: produces the current VaultState (empty / locked / unlocked) for
 * the popup. Resolves the EVM alias on first call after unlock and caches
 * it via the deps.evmAliasCache.
 */

import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import type { Keyring } from '../background/keyring';
import type { VaultState } from '../shared/messages';

export interface GetStateDeps {
  keyring:        Keyring;
  evmAliasCache:  { value: string | null };
}

export async function getState(deps: GetStateDeps): Promise<VaultState> {
  const hasVault = await deps.keyring.hasVault();
  if (!hasVault) return { status: 'empty' };

  const unlocked = deps.keyring.getUnlocked();
  if (unlocked == null) return { status: 'locked' };

  const alias = deps.evmAliasCache.value ?? await deriveEvmAlias(unlocked.tz1);
  deps.evmAliasCache.value = alias;
  return { status: 'unlocked', tz1: unlocked.tz1, evmAlias: alias };
}
