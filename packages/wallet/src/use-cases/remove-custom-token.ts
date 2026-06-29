/**
 * removeCustomToken: erases a registry entry. No-op if the address isn't
 * registered. Refuses to remove a builtin (CT4 marks the USDC seed).
 */

import type { AccountId } from '@tezosx/wallet-core/domain/account';
import { BuiltinTokenError } from '@tezosx/wallet-core/domain/token';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';

export interface RemoveCustomTokenReq {
  accountId: AccountId;
  address:   string;
}

export interface RemoveCustomTokenDeps {
  tokenStore: TokenStore;
}

export async function removeCustomToken(
  req:  RemoveCustomTokenReq,
  deps: RemoveCustomTokenDeps,
): Promise<void> {
  const normalised = req.address.toLowerCase();
  const existing   = await deps.tokenStore.list(req.accountId);
  const target     = existing.find((t) => t.address.toLowerCase() === normalised);
  if (target == null) return;
  if (target.builtin === true) throw new BuiltinTokenError(target.address);
  await deps.tokenStore.remove(req.accountId, target.address);
}
