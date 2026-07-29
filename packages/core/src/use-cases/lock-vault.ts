/**
 * lockVault: clears the keyring's in-memory unlocked state and rejects
 * every pending dApp approval. The persisted vault on disk is untouched.
 */

import type { Keyring } from '../background/keyring';
import type { ApprovalQueue } from '../background/approval-queue';

export interface LockVaultDeps {
  keyring:       Keyring;
  approvalQueue: ApprovalQueue;
}

export function lockVault(deps: LockVaultDeps): void {
  deps.keyring.lock();
  deps.approvalQueue.rejectAll('wallet locked');
}
