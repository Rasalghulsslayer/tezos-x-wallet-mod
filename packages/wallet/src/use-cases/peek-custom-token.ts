/**
 * peekCustomToken: same validation + metadata fetch as addCustomToken, but
 * does NOT persist. The UI runs this on the paste stage so it can preview
 * symbol / name / decimals on the confirm screen, and only writes to the
 * registry when the user confirms (via addCustomToken).
 */

import type { AccountId } from '@tezosx/wallet-core/domain/account';
import {
  type RegisteredToken,
  type TokenMetadata,
  TokenAlreadyRegisteredError,
  MaxTokensReachedError,
  NotErc20Error,
} from '@tezosx/wallet-core/domain/token';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import { fetchErc20Metadata } from '@tezosx/wallet-core/shared/erc20-metadata';
import { MAX_TOKENS_PER_ACCOUNT } from '@tezosx/wallet-core/shared/constants';
import { shortAddr } from '@tezosx/wallet-core/shared/format';

export interface PeekCustomTokenReq {
  accountId:  AccountId;
  address:    string;
  tryAnyway?: boolean;
}

export interface PeekCustomTokenDeps {
  tokenStore: TokenStore;
  rpcUrl:     string;
}

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export async function peekCustomToken(
  req:  PeekCustomTokenReq,
  deps: PeekCustomTokenDeps,
): Promise<RegisteredToken> {
  const address = req.address.trim();
  if (!EVM_ADDR_RE.test(address)) throw new Error('Invalid 0x address');
  const normalised = address.toLowerCase();

  const existing = await deps.tokenStore.list(req.accountId);
  const dup = existing.find((t) => t.address.toLowerCase() === normalised);
  if (dup != null) throw new TokenAlreadyRegisteredError(normalised, dup);

  if (existing.length >= MAX_TOKENS_PER_ACCOUNT) {
    throw new MaxTokensReachedError(MAX_TOKENS_PER_ACCOUNT);
  }

  let metadata: TokenMetadata;
  try {
    metadata = await fetchErc20Metadata(normalised, deps.rpcUrl);
  } catch (err) {
    if (err instanceof NotErc20Error && req.tryAnyway === true) {
      metadata = { symbol: shortAddr(normalised), name: 'Unknown token', decimals: 18 };
    } else {
      throw err;
    }
  }

  return {
    ...metadata,
    address: normalised,
    addedAt: Date.now(),
  };
}
