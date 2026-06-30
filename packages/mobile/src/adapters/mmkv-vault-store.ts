/**
 * MmkvVaultStore: the encrypted vault blob in MMKV. The blob is already
 * AES-GCM-encrypted (the unlock secret is sealed separately in the Keychain
 * behind biometrics), so MMKV is an appropriate home — fast, local, no iCloud
 * sync. Mirrors the extension's ChromeVaultStore against the same VaultStore port.
 */

import type { MMKV } from 'react-native-mmkv';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';

const VAULT_KEY = 'vault';

export class MmkvVaultStore implements VaultStore {
  constructor(private readonly mmkv: MMKV) {}

  async load(): Promise<EncryptedVault | undefined> {
    const raw = this.mmkv.getString(VAULT_KEY);
    return raw == null ? undefined : (JSON.parse(raw) as EncryptedVault);
  }

  async save(vault: EncryptedVault): Promise<void> {
    this.mmkv.set(VAULT_KEY, JSON.stringify(vault));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(VAULT_KEY);
  }
}
