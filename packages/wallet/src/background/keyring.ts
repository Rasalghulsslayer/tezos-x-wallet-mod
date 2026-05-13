import {
  deriveTezosIdentity,
  deriveTezosIdentityFromSecretKey,
  newMnemonic,
} from '../shared/seed';
import { isValidEdsk, isValidMnemonic } from '../domain/validation';
import type { VaultStore, EncryptedVault } from '../ports/vault-store';

/** Payload chiffré dans le vault. Distingue l'origine du secret. */
export type VaultPayload =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string };

/** Number of PBKDF2 iterations used to stretch the password into an AES-GCM key. */
const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES        = 16;
const IV_BYTES          = 12;

/** Unlocked keyring state held in SW memory — cleared on lock / SW death. */
export interface UnlockedIdentity {
  tz1:       string;
  publicKey: string;
  secretKey: string;  // Tezos-encoded (edsk...)
}

// ── Low-level crypto helpers (pure, no side-effects on storage) ───────────────

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptPayload(payload: VaultPayload, password: string): Promise<EncryptedVault> {
  const salt = randomBytes(SALT_BYTES);
  const iv   = randomBytes(IV_BYTES);
  const key  = await deriveAesKey(password, salt, PBKDF2_ITERATIONS);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );

  return {
    ciphertext: toBase64(ciphertext),
    iv:         toBase64(iv),
    salt:       toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

async function decryptVault(vault: EncryptedVault, password: string): Promise<VaultPayload> {
  const key = await deriveAesKey(password, fromBase64(vault.salt), vault.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(vault.iv) as BufferSource },
    key,
    fromBase64(vault.ciphertext) as BufferSource,
  );
  const raw = new TextDecoder().decode(plaintext);

  // Format actuel : JSON typé { kind, value }. Fallback sur l'ancien format
  // (plain mnemonic) pour les vaults créés avant l'introduction de edsk.
  try {
    const parsed = JSON.parse(raw) as VaultPayload;
    if (parsed != null && (parsed.kind === 'mnemonic' || parsed.kind === 'edsk')) {
      return parsed;
    }
  } catch {
    /* fallthrough : ancien format */
  }
  return { kind: 'mnemonic', value: raw };
}

// ── Keyring public API — orchestrates storage + crypto + derivation ───────────

export class Keyring {
  private unlocked: UnlockedIdentity | null = null;

  constructor(private readonly vaultStore: VaultStore) {}

  /** True when a vault is persisted in storage (wallet has been set up). */
  async hasVault(): Promise<boolean> {
    return (await this.vaultStore.load()) != null;
  }

  /** True when the vault has been decrypted in the current SW session. */
  isUnlocked(): boolean {
    return this.unlocked !== null;
  }

  /** Returns the unlocked identity, or null if the wallet is locked. */
  getUnlocked(): UnlockedIdentity | null {
    return this.unlocked;
  }

  /** Create a new wallet from a random BIP39 mnemonic. Returns the mnemonic for display. */
  async create(password: string): Promise<string> {
    const mnemonic = newMnemonic();
    await this.importFromMnemonic(mnemonic, password);
    return mnemonic;
  }

  /** Import an existing mnemonic and persist the encrypted vault. */
  async importFromMnemonic(mnemonic: string, password: string): Promise<UnlockedIdentity> {
    const trimmed = mnemonic.trim().toLowerCase();
    if (!isValidMnemonic(trimmed)) throw new Error('Invalid BIP39 mnemonic');
    if (password.length < 8)      throw new Error('Password must be at least 8 characters');

    await this.vaultStore.save(await encryptPayload({ kind: 'mnemonic', value: trimmed }, password));
    const identity = await deriveTezosIdentity(trimmed);
    this.unlocked = identity;
    return identity;
  }

  /** Import directly from a Tezos-encoded secret key (edsk...). */
  async importFromSecretKey(edsk: string, password: string): Promise<UnlockedIdentity> {
    const trimmed = edsk.trim();
    if (!isValidEdsk(trimmed))    throw new Error('Invalid Tezos secret key (expected edsk…)');
    if (password.length < 8)      throw new Error('Password must be at least 8 characters');

    const identity = await deriveTezosIdentityFromSecretKey(trimmed).catch(() => {
      throw new Error('Could not decode the secret key');
    });
    await this.vaultStore.save(await encryptPayload({ kind: 'edsk', value: trimmed }, password));
    this.unlocked = identity;
    return identity;
  }

  /** Unlock an existing vault with the user's password. */
  async unlock(password: string): Promise<UnlockedIdentity> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');

    const payload = await decryptVault(vault, password).catch(() => {
      throw new Error('Incorrect password');
    });

    const identity = payload.kind === 'mnemonic'
      ? await deriveTezosIdentity(payload.value)
      : await deriveTezosIdentityFromSecretKey(payload.value);
    this.unlocked = identity;
    return identity;
  }

  /** Clear the in-memory identity. Persisted vault is untouched. */
  lock(): void {
    this.unlocked = null;
  }

  /** Re-decrypt and return the raw secret (mnemonic or edsk) for user-initiated export. */
  async exportSecret(password: string): Promise<VaultPayload> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');
    return decryptVault(vault, password).catch(() => {
      throw new Error('Incorrect password');
    });
  }
}
