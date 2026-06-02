/**
 * Idempotent USDC (and any future DEFAULT_TOKENS_PER_RUNTIME entry) seed for
 * a given account's token registry. Re-running is a no-op when the seed
 * addresses are already present.
 */

import type { AccountId } from '../domain/account';
import type { TokenStore } from '../ports/token-store';
import { DEFAULT_TOKENS_PER_RUNTIME } from './constants';

export async function seedDefaultTokensForAccount(
  accountId:  AccountId,
  tokenStore: TokenStore,
): Promise<void> {
  const existing = await tokenStore.list(accountId);
  const existingAddrs = new Set(existing.map((t) => t.address.toLowerCase()));
  const now = Date.now();
  for (const seed of DEFAULT_TOKENS_PER_RUNTIME) {
    const addr = seed.address.toLowerCase();
    if (existingAddrs.has(addr)) continue;
    await tokenStore.upsert(accountId, {
      address:  addr,
      symbol:   seed.symbol,
      name:     seed.name,
      decimals: seed.decimals,
      addedAt:  now,
      builtin:  seed.builtin,
    });
  }
}
