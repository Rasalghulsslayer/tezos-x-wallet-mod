/**
 * createAccount: persists a fresh mnemonic-backed vault, then leaves the
 * keyring in its unlocked state. Container rebuild is the orchestrator's
 * responsibility (sw-wiring).
 */

import type { Keyring } from '../background/keyring';

export interface CreateAccountReq {
  mnemonic: string;
  password: string;
}

export interface CreateAccountDeps {
  keyring: Keyring;
}

export async function createAccount(
  req:  CreateAccountReq,
  deps: CreateAccountDeps,
): Promise<void> {
  await deps.keyring.importFromMnemonic(req.mnemonic, req.password);
}
