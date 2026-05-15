/**
 * Keyring: vault encryption/decryption and in-memory unlock state.
 * V1 (0.6.0): encrypted blob contains { kind: 'mnemonic'|'edsk', value }.
 * V2 (0.7.0): encrypted blob contains { version: 2, accounts, active, secrets }.
 * unlock() detects V1 and upgrades transparently; the caller migrates sessions.
 */

import {
  deriveTezosIdentity,
  deriveTezosIdentityFromSecretKey,
  newMnemonic,
} from '../shared/seed';
import { isValidEdsk, isValidMnemonic } from '../domain/validation';
import type { Account, AccountId, TezosAccount } from '../domain/account';
import type { VaultStore, EncryptedVault } from '../ports/vault-store';

// ── Secret payload types ───────────────────────────────────────────────────────

export type AccountSecret =
  | { kind: 'mnemonic'; value: string }
  | { kind: 'edsk';     value: string }
  | { kind: 'evm-pk';   value: string };

/** Alias kept for callers that imported VaultPayload. */
export type VaultPayload = AccountSecret;

/** V2 — 0.7.0 multi-account-ready format (stored as the encrypted plaintext). */
export type MultiAccountVaultPayload = {
  version:  2;
  accounts: Account[];
  active:   AccountId;
  secrets:  Record<AccountId, AccountSecret>;
};

/** Unlocked keyring state held in SW memory — cleared on lock / SW death. */
export interface UnlockedSession {
  account:   Account;
  secretKey: string;  // edsk… for Tezos; hex private key for EVM
}

// ── PBKDF2 / AES-GCM constants ────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 200_000;
const SALT_BYTES        = 16;
const IV_BYTES          = 12;

// ── Low-level crypto helpers ──────────────────────────────────────────────────

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

async function encryptJson<T>(payload: T, password: string): Promise<EncryptedVault> {
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

async function decryptVaultRaw(vault: EncryptedVault, password: string): Promise<string> {
  const key = await deriveAesKey(password, fromBase64(vault.salt), vault.iterations);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(vault.iv) as BufferSource },
    key,
    fromBase64(vault.ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

function tryParseV2(raw: string): MultiAccountVaultPayload | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version === 2 && Array.isArray(parsed.accounts)) {
      return parsed as unknown as MultiAccountVaultPayload;
    }
  } catch { /* not JSON or wrong shape */ }
  return null;
}

function parseLegacyV1(raw: string): AccountSecret & { kind: 'mnemonic' | 'edsk' } {
  try {
    const parsed = JSON.parse(raw) as AccountSecret;
    if (parsed.kind === 'mnemonic' || parsed.kind === 'edsk') {
      return parsed as AccountSecret & { kind: 'mnemonic' | 'edsk' };
    }
  } catch { /* fallthrough: plain mnemonic (very old format) */ }
  return { kind: 'mnemonic', value: raw };
}

// ── Keyring public API ────────────────────────────────────────────────────────

export class Keyring {
  private unlocked: UnlockedSession | null = null;

  constructor(private readonly vaultStore: VaultStore) {}

  async hasVault(): Promise<boolean> {
    return (await this.vaultStore.load()) != null;
  }

  isUnlocked(): boolean {
    return this.unlocked !== null;
  }

  getUnlocked(): UnlockedSession | null {
    return this.unlocked;
  }

  /** Create a new wallet from a random BIP39 mnemonic. Returns the mnemonic for display. */
  async create(password: string): Promise<string> {
    const mnemonic = newMnemonic();
    await this.importFromMnemonic(mnemonic, password);
    return mnemonic;
  }

  async importFromMnemonic(mnemonic: string, password: string): Promise<UnlockedSession> {
    const trimmed = mnemonic.trim().toLowerCase();
    if (!isValidMnemonic(trimmed)) throw new Error('Invalid BIP39 mnemonic');
    if (password.length < 8)      throw new Error('Password must be at least 8 characters');

    const { tz1, publicKey, secretKey } = await deriveTezosIdentity(trimmed);
    const accountId = tz1;
    const account: TezosAccount = { kind: 'tezos', id: accountId, tz1, publicKey };
    const payload: MultiAccountVaultPayload = {
      version:  2,
      accounts: [account],
      active:   accountId,
      secrets:  { [accountId]: { kind: 'mnemonic', value: trimmed } },
    };
    await this.vaultStore.save(await encryptJson(payload, password));
    this.unlocked = { account, secretKey };
    return this.unlocked;
  }

  async importFromSecretKey(edsk: string, password: string): Promise<UnlockedSession> {
    const trimmed = edsk.trim();
    if (!isValidEdsk(trimmed)) throw new Error('Invalid Tezos secret key (expected edsk…)');
    if (password.length < 8)   throw new Error('Password must be at least 8 characters');

    const { tz1, publicKey, secretKey } = await deriveTezosIdentityFromSecretKey(trimmed).catch(() => {
      throw new Error('Could not decode the secret key');
    });
    const accountId = tz1;
    const account: TezosAccount = { kind: 'tezos', id: accountId, tz1, publicKey };
    const payload: MultiAccountVaultPayload = {
      version:  2,
      accounts: [account],
      active:   accountId,
      secrets:  { [accountId]: { kind: 'edsk', value: trimmed } },
    };
    await this.vaultStore.save(await encryptJson(payload, password));
    this.unlocked = { account, secretKey };
    return this.unlocked;
  }

  /**
   * Unlock an existing vault. Detects the V1 (0.6.0) format and upgrades it
   * to V2 in-place. The caller should migrate the session store when
   * upgraded === true.
   */
  async unlock(password: string): Promise<{ session: UnlockedSession; upgraded: boolean; accountId: AccountId }> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');

    let raw: string;
    try {
      raw = await decryptVaultRaw(vault, password);
    } catch {
      throw new Error('Incorrect password');
    }

    const v2 = tryParseV2(raw);
    if (v2 != null) {
      const activeId = v2.active;
      const account  = v2.accounts.find(a => a.id === activeId);
      const secret   = v2.secrets[activeId];
      if (account == null || secret == null) throw new Error('Vault corrupted: active account not found');

      let secretKey: string;
      if (account.kind === 'tezos') {
        ({ secretKey } = secret.kind === 'mnemonic'
          ? await deriveTezosIdentity(secret.value)
          : await deriveTezosIdentityFromSecretKey(secret.value));
      } else {
        secretKey = secret.value;
      }

      this.unlocked = { account, secretKey };
      return { session: this.unlocked, upgraded: false, accountId: activeId };
    }

    // V1 legacy — upgrade to V2 in place
    const legacy = parseLegacyV1(raw);
    const { tz1, publicKey, secretKey } = legacy.kind === 'mnemonic'
      ? await deriveTezosIdentity(legacy.value)
      : await deriveTezosIdentityFromSecretKey(legacy.value);

    const accountId = tz1;
    const account: TezosAccount = { kind: 'tezos', id: accountId, tz1, publicKey };
    const v2Payload: MultiAccountVaultPayload = {
      version:  2,
      accounts: [account],
      active:   accountId,
      secrets:  { [accountId]: legacy },
    };
    await this.vaultStore.save(await encryptJson(v2Payload, password));

    this.unlocked = { account, secretKey };
    return { session: this.unlocked, upgraded: true, accountId };
  }

  lock(): void {
    this.unlocked = null;
  }

  async exportSecret(password: string): Promise<AccountSecret> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');

    let raw: string;
    try {
      raw = await decryptVaultRaw(vault, password);
    } catch {
      throw new Error('Incorrect password');
    }

    const v2 = tryParseV2(raw);
    if (v2 != null) {
      const secret = v2.secrets[v2.active];
      if (secret == null) throw new Error('Vault corrupted: active secret not found');
      return secret;
    }
    return parseLegacyV1(raw);
  }
}
