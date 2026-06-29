/**
 * listRegisteredTokens: sorted snapshot for the popup. Registered-order
 * (addedAt ASC) per the Phase 0 decision; renames don't shift peers' position.
 */

import type { AccountId } from '@tezosx/wallet-core/domain/account';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';

export interface ListRegisteredTokensReq {
  accountId: AccountId;
}

export interface ListRegisteredTokensDeps {
  tokenStore: TokenStore;
}

export async function listRegisteredTokens(
  req:  ListRegisteredTokensReq,
  deps: ListRegisteredTokensDeps,
): Promise<RegisteredToken[]> {
  const list = await deps.tokenStore.list(req.accountId);
  return list.slice().sort((a, b) => a.addedAt - b.addedAt);
}
