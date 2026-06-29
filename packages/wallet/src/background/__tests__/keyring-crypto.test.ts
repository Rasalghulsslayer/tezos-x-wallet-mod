import { describe, it, expect } from 'vitest';
import { Keyring } from '../keyring';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';

class MemoryVaultStore implements VaultStore {
  vault: EncryptedVault | undefined;
  async load() { return this.vault; }
  async save(v: EncryptedVault) { this.vault = v; }
  async clear() { this.vault = undefined; }
}

const PASSWORD = 'correct-horse-battery';

// Mirror of the keyring's encryptJson, used only to forge vaults with crafted
// plaintext. It is self-validating: a test that asserts the *format* error
// ("Vault format unsupported"), and would instead see "Incorrect password" if
// this helper's crypto diverged from the keyring's, confirms decrypt succeeded.
async function forgeVault(payload: unknown, password: string): Promise<EncryptedVault> {
  const enc  = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  const key  = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(JSON.stringify(payload))),
  );
  const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
  return { ciphertext: b64(ct), iv: b64(iv), salt: b64(salt), iterations: 200_000 };
}

describe('keyring — vault crypto', () => {
  it('unlock rejects a wrong password and accepts the right one', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(PASSWORD);
    k.lock();

    await expect(k.unlock('not-the-password')).rejects.toThrow(/Incorrect password/);
    const { accountId } = await k.unlock(PASSWORD);
    expect(accountId).toBeTruthy();
  });

  it('rejects a tampered ciphertext (AES-GCM authentication)', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(PASSWORD);
    k.lock();

    const v = store.vault!;
    const bytes = Buffer.from(v.ciphertext, 'base64');
    bytes[0] ^= 0xff; // flip a byte → the GCM auth tag no longer matches
    store.vault = { ...v, ciphertext: bytes.toString('base64') };

    await expect(k.unlock(PASSWORD)).rejects.toThrow(/Incorrect password/);
  });

  it('uses a fresh random salt and IV on every save', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    await k.create(PASSWORD);
    const first = store.vault!;
    // Hardened to the OWASP/MetaMask floor (#77). Old 200k vaults still unlock
    // via the per-vault `iterations` field — see the forgeVault-based tests.
    expect(first.iterations).toBe(600_000);

    await k.renameAccount(k.getUnlocked()!.account.id, 'Renamed'); // forces a re-encrypt
    const second = store.vault!;
    expect(second.salt).not.toBe(first.salt);
    expect(second.iv).not.toBe(first.iv);
  });

  it('rejects a vault whose decrypted payload is not version 2 (parseV2 guard)', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    store.vault = await forgeVault({ version: 1, accounts: [] }, PASSWORD);
    await expect(k.unlock(PASSWORD)).rejects.toThrow(/Vault format unsupported/);
  });

  it('rejects a v2 vault whose accounts field is not an array (parseV2 guard)', async () => {
    const store = new MemoryVaultStore();
    const k = new Keyring(store, new WebCryptoPort());
    store.vault = await forgeVault({ version: 2, accounts: 'nope' }, PASSWORD);
    await expect(k.unlock(PASSWORD)).rejects.toThrow(/Vault format unsupported/);
  });
});
