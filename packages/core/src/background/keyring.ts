/**
 * Keyring: crypto + persistence + in-memory unlock cache.
 * Vault shape + mutation logic live in domain/vault. UnlockedKeyring caches
 * the password in SW memory so add/remove/setActive/rename don't re-prompt
 * (evicted on lock / SW death).
 */

import {
  deriveTezosIdentity,
  deriveTezosIdentityFromSecretKey,
  newMnemonic,
} from '../shared/seed';
import { deriveEvmAccount } from '../shared/evm-signing/index';
import { isValidEdsk, isValidMnemonic } from '../domain/validation';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import type { Account, AccountId, EvmAccount, TezosAccount, AccountSummary, AddAccountSource } from '../domain/account';
import {
  type AccountSecret,
  type MultiAccountVaultPayload,
  AccountNotFoundError,
  addAccountToPayload,
  removeAccountFromPayload,
  setActiveOnPayload,
  renameOnPayload,
  normaliseLabel,
} from '../domain/vault';
import type { VaultStore } from '../ports/vault-store';
import type { CryptoPort } from '../ports/crypto-port';
import { encryptVault, decryptVault } from '../shared/vault-crypto';

// Re-exports for callers that imported from keyring directly.
export type { AccountSecret, MultiAccountVaultPayload } from '../domain/vault';
export {
  MaxAccountsReachedError,
  CannotRemoveLastAccountError,
  AccountNotFoundError,
} from '../domain/vault';

export type VaultPayload = AccountSecret;

export interface UnlockedSession {
  account:   Account;
  secretKey: string;
}

export interface UnlockedKeyring extends UnlockedSession {
  payload:  MultiAccountVaultPayload;
  password: string;
}

function parseV2(raw: string): MultiAccountVaultPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.version !== 2 || !Array.isArray(parsed.accounts)) throw new Error('Vault format unsupported');
  return parsed as unknown as MultiAccountVaultPayload;
}

async function deriveSigningKey(account: Account, secret: AccountSecret): Promise<string> {
  if (account.kind === 'tezos') {
    if (secret.kind === 'mnemonic') return (await deriveTezosIdentity(secret.value)).secretKey;
    if (secret.kind === 'edsk')     return (await deriveTezosIdentityFromSecretKey(secret.value)).secretKey;
    throw new Error(`Tezos account incompatible with secret kind: ${secret.kind}`);
  }
  if (secret.kind !== 'evm-pk') throw new Error(`EVM account incompatible with secret kind: ${secret.kind}`);
  return secret.value;
}

function freshEvmPrivkeyHex(crypto: CryptoPort): string {
  const bytes = crypto.randomBytes(32);
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export class Keyring {
  private unlocked: UnlockedKeyring | null = null;

  constructor(
    private readonly vaultStore: VaultStore,
    private readonly crypto: CryptoPort,
  ) {}

  async hasVault(): Promise<boolean> {
    return (await this.vaultStore.load()) != null;
  }

  isUnlocked(): boolean {
    return this.unlocked !== null;
  }

  getUnlocked(): UnlockedKeyring | null {
    return this.unlocked;
  }

  async create(password: string): Promise<string> {
    const mnemonic = newMnemonic();
    await this.importFromMnemonic(mnemonic, password);
    return mnemonic;
  }

  async importFromMnemonic(mnemonic: string, password: string): Promise<UnlockedKeyring> {
    const trimmed = mnemonic.trim().toLowerCase();
    if (!isValidMnemonic(trimmed)) throw new Error('Invalid BIP39 mnemonic');
    if (password.length < 8)      throw new Error('Password must be at least 8 characters');
    const { tz1, publicKey, secretKey } = await deriveTezosIdentity(trimmed);
    const account: TezosAccount = newTezosAccount(this.crypto, tz1, publicKey);
    return this.initialiseVault(account, { kind: 'mnemonic', value: trimmed }, secretKey, password);
  }

  async importFromSecretKey(edsk: string, password: string): Promise<UnlockedKeyring> {
    const trimmed = edsk.trim();
    if (!isValidEdsk(trimmed)) throw new Error('Invalid Tezos secret key (expected edsk…)');
    if (password.length < 8)   throw new Error('Password must be at least 8 characters');
    const { tz1, publicKey, secretKey } = await deriveTezosIdentityFromSecretKey(trimmed).catch(() => {
      throw new Error('Could not decode the secret key');
    });
    const account: TezosAccount = newTezosAccount(this.crypto, tz1, publicKey);
    return this.initialiseVault(account, { kind: 'edsk', value: trimmed }, secretKey, password);
  }

  async importFromEvmPrivkey(privateKeyHex: string, password: string): Promise<UnlockedKeyring> {
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    const { address, publicKey, privateKey } = deriveEvmAccount(privateKeyHex);
    const account: EvmAccount = newEvmAccount(this.crypto, address, publicKey);
    return this.initialiseVault(account, { kind: 'evm-pk', value: privateKey }, privateKey, password);
  }

  async unlock(password: string): Promise<{ session: UnlockedSession; accountId: AccountId }> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');
    let raw: string;
    try {
      raw = await decryptVault(vault, password, this.crypto);
    } catch {
      throw new Error('Incorrect password');
    }
    const payload  = parseV2(raw);
    const activeId = payload.active;
    const account  = payload.accounts.find(a => a.id === activeId);
    const secret   = payload.secrets[activeId];
    if (account == null || secret == null) throw new Error('Vault corrupted: active account not found');
    const secretKey = await deriveSigningKey(account, secret);
    this.unlocked = { account, secretKey, payload, password };
    return { session: this.unlocked, accountId: activeId };
  }

  lock(): void {
    this.unlocked = null;
  }

  async exportSecret(password: string): Promise<AccountSecret> {
    const active = this.unlocked?.payload.active;
    if (active == null) return this.exportFromDisk(password);
    return this.exportSecretFor(active, password);
  }

  async exportSecretFor(accountId: AccountId, password: string): Promise<AccountSecret> {
    const raw     = await this.decryptFromDisk(password);
    const payload = parseV2(raw);
    const secret  = payload.secrets[accountId];
    if (secret == null) throw new AccountNotFoundError(accountId);
    return secret;
  }

  async addTezosAccount(
    src: AddAccountSource,
    label?: string,
  ): Promise<{ accountId: AccountId; account: TezosAccount; mnemonic?: string }> {
    const u = this.requireUnlocked();
    let mnemonic: string | undefined;
    let secret:    AccountSecret;
    let tz1:       string;
    let publicKey: string;

    if (src.source === 'fresh') {
      mnemonic = newMnemonic();
      ({ tz1, publicKey } = await deriveTezosIdentity(mnemonic));
      secret = { kind: 'mnemonic', value: mnemonic };
    } else if (src.source === 'mnemonic') {
      const trimmed = src.mnemonic.trim().toLowerCase();
      if (!isValidMnemonic(trimmed)) throw new Error('Invalid BIP39 mnemonic');
      ({ tz1, publicKey } = await deriveTezosIdentity(trimmed));
      secret = { kind: 'mnemonic', value: trimmed };
    } else if (src.source === 'edsk') {
      const trimmed = src.edsk.trim();
      if (!isValidEdsk(trimmed)) throw new Error('Invalid Tezos secret key (expected edsk…)');
      ({ tz1, publicKey } = await deriveTezosIdentityFromSecretKey(trimmed).catch(() => {
        throw new Error('Could not decode the secret key');
      }));
      secret = { kind: 'edsk', value: trimmed };
    } else {
      throw new Error('Invalid source for Tezos account');
    }

    const account = newTezosAccount(this.crypto, tz1, publicKey, label);
    await this.persist(addAccountToPayload(u.payload, account, secret), u.password);
    return { accountId: account.id, account, mnemonic };
  }

  async addEvmAccount(
    src: AddAccountSource,
    label?: string,
  ): Promise<{ accountId: AccountId; account: EvmAccount; privateKey?: string }> {
    const u = this.requireUnlocked();
    let privateKeyHex: string;
    let returnPriv:    string | undefined;
    if (src.source === 'fresh') {
      privateKeyHex = freshEvmPrivkeyHex(this.crypto);
      returnPriv    = privateKeyHex;
    } else if (src.source === 'privkey') {
      privateKeyHex = src.privateKey;
    } else {
      throw new Error('Invalid source for EVM account');
    }

    const { address, publicKey, privateKey } = deriveEvmAccount(privateKeyHex);
    const account = newEvmAccount(this.crypto, address, publicKey, label);
    await this.persist(addAccountToPayload(u.payload, account, { kind: 'evm-pk', value: privateKey }), u.password);
    return { accountId: account.id, account, privateKey: returnPriv };
  }

  async removeAccount(accountId: AccountId, password: string): Promise<void> {
    const u = this.requireUnlocked();
    if (password !== u.password) throw new Error('Incorrect password');
    await this.persist(removeAccountFromPayload(u.payload, accountId), u.password);
  }

  async setActiveAccount(accountId: AccountId): Promise<void> {
    const u = this.requireUnlocked();
    const next = setActiveOnPayload(u.payload, accountId);
    if (next === u.payload) return;
    await this.persist(next, u.password);
  }

  async renameAccount(accountId: AccountId, label: string): Promise<void> {
    const u = this.requireUnlocked();
    await this.persist(renameOnPayload(u.payload, accountId, label), u.password);
  }

  listAccounts(): readonly Account[] {
    return this.unlocked?.payload.accounts ?? [];
  }

  /** Resolve the signing key for any account in the unlocked vault, not just the active one. */
  async getSigningKeyFor(accountId: AccountId): Promise<{ account: Account; secretKey: string }> {
    const u = this.requireUnlocked();
    const account = u.payload.accounts.find(a => a.id === accountId);
    const secret  = u.payload.secrets[accountId];
    if (account == null || secret == null) throw new AccountNotFoundError(accountId);
    const secretKey = await deriveSigningKey(account, secret);
    return { account, secretKey };
  }

  async listAccountSummaries(): Promise<AccountSummary[]> {
    return Promise.all(this.listAccounts().map(async (a) => {
      if (a.kind === 'tezos') {
        return {
          id:               a.id,
          kind:             a.kind,
          label:            a.label,
          primaryAddress:   a.tz1,
          secondaryAddress: await deriveEvmAlias(a.tz1),
          createdAt:        a.createdAt,
        } satisfies AccountSummary;
      }
      return {
        id:             a.id,
        kind:           a.kind,
        label:          a.label,
        primaryAddress: a.address,
        createdAt:      a.createdAt,
      } satisfies AccountSummary;
    }));
  }

  private async initialiseVault(
    account:   Account,
    secret:    AccountSecret,
    secretKey: string,
    password:  string,
  ): Promise<UnlockedKeyring> {
    const payload: MultiAccountVaultPayload = {
      version:  2,
      accounts: [account],
      active:   account.id,
      secrets:  { [account.id]: secret },
    };
    await this.vaultStore.save(await encryptVault(JSON.stringify(payload), password, this.crypto));
    this.unlocked = { account, secretKey, payload, password };
    return this.unlocked;
  }

  private async persist(newPayload: MultiAccountVaultPayload, password: string): Promise<void> {
    await this.vaultStore.save(await encryptVault(JSON.stringify(newPayload), password, this.crypto));
    const active = newPayload.accounts.find(a => a.id === newPayload.active);
    const secret = newPayload.secrets[newPayload.active];
    if (active == null || secret == null) throw new Error('Vault corrupted after mutation');
    const secretKey = await deriveSigningKey(active, secret);
    this.unlocked = { account: active, secretKey, payload: newPayload, password };
  }

  private requireUnlocked(): UnlockedKeyring {
    if (this.unlocked == null) throw new Error('Wallet is locked');
    return this.unlocked;
  }

  private async exportFromDisk(password: string): Promise<AccountSecret> {
    const raw = await this.decryptFromDisk(password);
    const v2  = parseV2(raw);
    const secret = v2.secrets[v2.active];
    if (secret == null) throw new Error('Vault corrupted: active secret not found');
    return secret;
  }

  private async decryptFromDisk(password: string): Promise<string> {
    const vault = await this.vaultStore.load();
    if (vault == null) throw new Error('No wallet found');
    try {
      return await decryptVault(vault, password, this.crypto);
    } catch {
      throw new Error('Incorrect password');
    }
  }
}

function newTezosAccount(crypto: CryptoPort, tz1: string, publicKey: string, label?: string): TezosAccount {
  return { kind: 'tezos', id: crypto.randomUUID(), label: normaliseLabel(label), tz1, publicKey, createdAt: Date.now() };
}

function newEvmAccount(crypto: CryptoPort, address: `0x${string}`, publicKey: `0x${string}`, label?: string): EvmAccount {
  return { kind: 'evm', id: crypto.randomUUID(), label: normaliseLabel(label), address, publicKey, createdAt: Date.now() };
}
