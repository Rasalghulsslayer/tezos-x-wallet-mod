/**
 * EncryptedVault: persisted AES-GCM ciphertext shape.
 * VaultStore: persistence interface for save/load/clear.
 */

export interface EncryptedVault {
  ciphertext: string;
  iv:         string;
  salt:       string;
  iterations: number;
}

export interface VaultStore {
  load():  Promise<EncryptedVault | undefined>;
  save(vault: EncryptedVault): Promise<void>;
  clear(): Promise<void>;
}
