/**
 * UnlockGuardStore: persists the unlock failure counter and lockout deadline
 * so a throttle survives a service-worker restart (the vault sits in plaintext
 * on disk, so an offline attacker restarts the process freely — an in-memory
 * counter would be trivially reset). Optional: a keyring built without one
 * simply does no throttling.
 */

export interface UnlockGuardState {
  failedAttempts: number;
  /** Epoch ms before which unlock attempts are refused; 0 = not locked out. */
  lockoutUntil:   number;
}

export interface UnlockGuardStore {
  load():  Promise<UnlockGuardState | undefined>;
  save(state: UnlockGuardState): Promise<void>;
  clear(): Promise<void>;
}
