/**
 * unlockVault: decrypts the stored vault, loads the active account into the
 * keyring's in-memory state, and seeds DEFAULT_TOKENS_PER_RUNTIME (currently
 * just USDC) into every account's registry. The seed is idempotent.
 */

import type { Keyring } from '../background/keyring';
import type { TokenStore } from '../ports/token-store';
import { seedDefaultTokensForAccount } from '../shared/seed-default-tokens';

export interface UnlockVaultReq {
  password: string;
}

export interface UnlockVaultDeps {
  keyring:    Keyring;
  tokenStore: TokenStore;
}

export async function unlockVault(req: UnlockVaultReq, deps: UnlockVaultDeps): Promise<void> {
  await deps.keyring.unlock(req.password);
  const unlocked = deps.keyring.getUnlocked();
  if (unlocked == null) return;
  for (const account of unlocked.payload.accounts) {
    await seedDefaultTokensForAccount(account.id, deps.tokenStore);
  }
}
