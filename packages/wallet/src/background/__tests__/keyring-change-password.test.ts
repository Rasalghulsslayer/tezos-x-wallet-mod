/**
 * changePassword + wipe against the real vault crypto (WebCryptoPort): the
 * re-seal must keep the standard envelope (same shape, fresh salt, current
 * work factor), the old password must die with the old key, the retention
 * contract must hold (wrong current password leaves everything intact), and
 * wipe must destroy vault + throttle state while keeping the keyring locked.
 */

import { describe, it, expect } from 'vitest';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { PBKDF2_ITERATIONS } from '@tezosx/wallet-core/shared/vault-crypto';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';
import type { UnlockGuardStore, UnlockGuardState } from '@tezosx/wallet-core/ports/unlock-guard-store';

class MemoryVaultStore implements VaultStore {
  vault: EncryptedVault | undefined;
  async load() { return this.vault; }
  async save(v: EncryptedVault) { this.vault = v; }
  async clear() { this.vault = undefined; }
}

class MemoryUnlockGuard implements UnlockGuardStore {
  state: UnlockGuardState | undefined;
  async load() { return this.state; }
  async save(s: UnlockGuardState) { this.state = s; }
  async clear() { this.state = undefined; }
}

const OLD_PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'staple-gun-tuesday';

describe('keyring — changePassword', () => {
  it('re-seals so only the new password unlocks, with addresses unchanged', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);
    const before = k.getUnlocked()!.account;

    await k.changePassword(OLD_PASSWORD, NEW_PASSWORD);

    // Still unlocked and usable in place after the change.
    expect(k.isUnlocked()).toBe(true);
    expect(k.getUnlocked()!.account.id).toBe(before.id);

    k.lock();
    await expect(k.unlock(OLD_PASSWORD)).rejects.toThrow(/Incorrect password/);
    const { accountId } = await k.unlock(NEW_PASSWORD);
    expect(accountId).toBe(before.id);
  });

  it('keeps the standard envelope: same field shape, fresh salt, current work factor', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);
    const sealedBefore = store.vault!;

    await k.changePassword(OLD_PASSWORD, NEW_PASSWORD);
    const sealedAfter = store.vault!;

    expect(Object.keys(sealedAfter).sort()).toEqual(['ciphertext', 'iterations', 'iv', 'salt']);
    expect(sealedAfter.iterations).toBe(PBKDF2_ITERATIONS);
    expect(sealedAfter.salt).not.toBe(sealedBefore.salt);
    expect(sealedAfter.iv).not.toBe(sealedBefore.iv);
  });

  it('a wrong current password changes nothing', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);
    const sealedBefore = store.vault!;

    await expect(k.changePassword('not-the-password', NEW_PASSWORD)).rejects.toThrow(/Incorrect password/);

    expect(store.vault).toBe(sealedBefore);
    k.lock();
    await expect(k.unlock(NEW_PASSWORD)).rejects.toThrow(/Incorrect password/);
    await k.unlock(OLD_PASSWORD);
    expect(k.isUnlocked()).toBe(true);
  });

  it('enforces the same minimum length as onboarding on the new password', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);

    await expect(k.changePassword(OLD_PASSWORD, 'short')).rejects.toThrow(/at least 8 characters/);
    k.lock();
    await k.unlock(OLD_PASSWORD);
    expect(k.isUnlocked()).toBe(true);
  });

  it('refuses while locked (the flow lives behind Settings)', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);
    k.lock();

    await expect(k.changePassword(OLD_PASSWORD, NEW_PASSWORD)).rejects.toThrow(/locked/i);
  });

  it('persists a pending in-memory active-pointer change along with the re-seal', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(OLD_PASSWORD);
    const { accountId: second } = await k.addEvmAccount({ source: 'fresh' });
    k.activateInMemory(second);

    await k.changePassword(OLD_PASSWORD, NEW_PASSWORD);

    k.lock();
    await k.unlock(NEW_PASSWORD);
    expect(k.getUnlocked()!.account.id).toBe(second);
  });
});

describe('keyring — wipe (forgot-password recovery)', () => {
  it('destroys the vault and the throttle state and leaves the keyring locked and empty', async () => {
    const store = new MemoryVaultStore();
    const guard = new MemoryUnlockGuard();
    const k = new Keyring(store, new WebCryptoPort(), guard);
    await k.create(OLD_PASSWORD);
    k.lock();
    // Arm some throttle state so the wipe visibly clears it.
    await expect(k.unlock('wrong-1')).rejects.toThrow();
    expect(guard.state?.failedAttempts).toBeGreaterThan(0);

    await k.wipe();

    expect(k.isUnlocked()).toBe(false);
    expect(await k.hasVault()).toBe(false);
    expect(guard.state).toBeUndefined();
  });

  it('after a wipe, onboarding from the same seed phrase restores the index-0 account', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    const mnemonic = await k.create(OLD_PASSWORD);
    const tz1 = (k.getUnlocked()!.account as { tz1: string }).tz1;

    await k.wipe();
    await k.importFromMnemonic(mnemonic, NEW_PASSWORD);

    expect((k.getUnlocked()!.account as { tz1: string }).tz1).toBe(tz1);
    expect(k.hasWalletSeed()).toBe(true);
  });
});
