/**
 * unlockVault: decrypts the stored vault and loads the session into the
 * keyring's in-memory state. If the vault was in the legacy 0.6.0 single-
 * account format the keyring upgrades it to V2 in place; this function then
 * eagerly rewrites all persisted dApp sessions to carry the account's id.
 */

import type { Keyring } from '../background/keyring';
import type { SessionStore } from '../ports/session-store';

export interface UnlockVaultReq {
  password: string;
}

export interface UnlockVaultDeps {
  keyring:      Keyring;
  sessionStore: SessionStore;
}

export async function unlockVault(
  req:  UnlockVaultReq,
  deps: UnlockVaultDeps,
): Promise<void> {
  const { upgraded, accountId } = await deps.keyring.unlock(req.password);

  if (upgraded) {
    const sessions = await deps.sessionStore.list();
    await Promise.all(
      sessions.map(s => deps.sessionStore.upsert({ ...s, accountId })),
    );
  }
}
