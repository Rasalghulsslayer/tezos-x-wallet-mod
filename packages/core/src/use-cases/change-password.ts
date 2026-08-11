/**
 * changePassword: re-seal the vault under a new password after re-verifying
 * the current one. Envelope format and retention contract are unchanged (see
 * Keyring.changePassword). Mobile shells must re-seal the biometric unlock
 * secret in the same flow — the keystore otherwise keeps releasing the old
 * password (see the mobile vault-actions wrapper).
 */

import type { Keyring } from '../background/keyring';

export interface ChangePasswordReq {
  currentPassword: string;
  newPassword:     string;
}

export interface ChangePasswordDeps {
  keyring: Keyring;
}

export async function changePassword(req: ChangePasswordReq, deps: ChangePasswordDeps): Promise<void> {
  await deps.keyring.changePassword(req.currentPassword, req.newPassword);
}
