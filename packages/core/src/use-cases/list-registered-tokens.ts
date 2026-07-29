/**
 * listRegisteredTokens: sorted snapshot for the popup. Registered-order
 * (addedAt ASC) per the Phase 0 decision; renames don't shift peers' position.
 */

import type { AccountId } from '../domain/account';
import type { RegisteredToken } from '../domain/token';
import type { TokenStore } from '../ports/token-store';

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
