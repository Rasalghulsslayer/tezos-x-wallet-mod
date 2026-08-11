/**
 * resetWallet: the forgot-password recovery path. The vault ciphertext is
 * unrecoverable without the password by design (the seed phrase is a key to
 * the accounts it derives, not to the envelope), so recovery wipes the vault
 * and walks the user back through onboarding with their seed phrase.
 *
 * What this clears: the sealed vault + unlock throttle (keyring.wipe), dApp
 * sessions (bound to account ids that will no longer exist), and the
 * per-account token registries (same reason). What it deliberately KEEPS:
 * the address book — contacts are wallet-global, non-secret, and still
 * useful after recovery. Platform extras (the mobile Keychain-sealed unlock
 * password) are cleared by the shell around this use-case.
 *
 * Callable while locked — that is the whole point — so the UI in front of it
 * must be explicit about what is and is not recoverable before firing.
 */

import type { Keyring } from '../background/keyring';
import type { SessionStore } from '../ports/session-store';
import type { TokenStore } from '../ports/token-store';

export interface ResetWalletDeps {
  keyring:      Keyring;
  sessionStore: SessionStore;
  tokenStore:   TokenStore;
}

export async function resetWallet(deps: ResetWalletDeps): Promise<void> {
  await deps.keyring.wipe();
  await deps.sessionStore.clear();
  await deps.tokenStore.clear();
}
