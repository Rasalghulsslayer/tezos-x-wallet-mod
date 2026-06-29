/**
 * ChromeVaultStore: VaultStore implementation backed by chrome.storage.local.
 */

import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';

export class ChromeVaultStore implements VaultStore {
  async load(): Promise<EncryptedVault | undefined> {
    const data = await chrome.storage.local.get('vault');
    return data.vault as EncryptedVault | undefined;
  }

  async save(vault: EncryptedVault): Promise<void> {
    await chrome.storage.local.set({ vault });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove('vault');
  }
}
