/**
 * Keyring: crypto + persistence + in-memory unlock cache.
 * Vault shape + mutation logic live in domain/vault. UnlockedKeyring retains
 * the PBKDF2-derived vault key (never the password) so add/remove/setActive/
 * rename can re-seal without re-prompting; the key is zeroized on lock. The
 * password itself only ever exists transiently — inside unlock and the
 * export flows that re-prompt for it.
 */

import {
  deriveTezosIdentity,
  deriveTezosIdentityFromSecretKey,
  newMnemonic,
} from '../shared/seed';
import { deriveEvmAccount, deriveEvmFromMnemonic } from '../shared/evm-signing/index';
import { isValidEdsk, isValidMnemonic } from '../domain/validation';
import { deriveEvmAlias } from '@tezosx/relayer/utils/derive';
import type { Account, AccountId, EvmAccount, TezosAccount, AccountSummary, AddAccountSource } from '../domain/account';
import {
  type AccountSecret,
  type MultiAccountVaultPayload,
  type RevealedSecret,
  AccountNotFoundError,
  NoWalletSeedError,
  DuplicateAccountError,
  addAccountToPayload,
  nextDerivationIndex,
  removeAccountFromPayload,
  setActiveOnPayload,
  renameOnPayload,
  normaliseLabel,
} from '../domain/vault';
import type { VaultStore } from '../ports/vault-store';
import type { CryptoPort } from '../ports/crypto-port';
import {
  decryptVault,
  decryptVaultWithKey,
  deriveVaultKey,
  encryptVaultWithKey,
  freshVaultSalt,
  PBKDF2_ITERATIONS,
  type VaultKeyMaterial,
} from '../shared/vault-crypto';
import { constantTimeEqual, wipe } from '../shared/wipe';

// Re-exports for callers that imported from keyring directly.
export type { AccountSecret, MultiAccountVaultPayload, RevealedSecret } from '../domain/vault';
export {
  MaxAccountsReachedError,
  CannotRemoveLastAccountError,
  AccountNotFoundError,
  NoWalletSeedError,
  DuplicateAccountError,
} from '../domain/vault';

export type VaultPayload = AccountSecret;

export interface UnlockedSession {
  account:   Account;
  secretKey: string;
}

export interface UnlockedKeyring extends UnlockedSession {
  payload: MultiAccountVaultPayload;
  /** The derived vault key (zeroized on lock) plus the salt / work factor it
   *  was derived at — what re-seals and password re-verification run on. */
  km: VaultKeyMaterial;
}

function parsePayload(raw: string): MultiAccountVaultPayload {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!Array.isArray(parsed.accounts)) throw new Error('Vault format unsupported');
  if (parsed.version === 3) return parsed as unknown as MultiAccountVaultPayload;
  // v2 → v3 carries the same fields and gains no wallet seed: the provenance
  // of a v2 account's mnemonic is unknowable, so none is promoted — the seed
  // is only ever written by onboarding. The upgraded payload reaches disk on
  // the next mutation, like the PBKDF2 work-factor upgrade.
  if (parsed.version === 2) return { ...parsed, version: 3 } as unknown as MultiAccountVaultPayload;
  throw new Error('Vault format unsupported');
}

async function deriveSigningKey(
  account: Account,
  secret:  AccountSecret,
  seed?:   { mnemonic: string },
): Promise<string> {
  if (secret.kind === 'derived') {
    if (seed == null) throw new NoWalletSeedError();
    return account.kind === 'tezos'
      ? (await deriveTezosIdentity(seed.mnemonic, secret.index)).secretKey
      : (await deriveEvmFromMnemonic(seed.mnemonic, secret.index)).privateKey;
  }
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
  // Set when activateInMemory has flipped the active pointer but the vault has
  // not yet been re-sealed to disk; cleared once flushActive (or any persist)
  // writes it. See activateInMemory for why the disk write is deferred.
  private activeDirty = false;

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
    // The onboarding phrase becomes the wallet seed, with the first account at
    // HD index 0 — the same path the single-account derivation always used, so
    // the address is unchanged. Later "add account" derives the next index
    // from this phrase instead of minting a new one.
    const { tz1, publicKey, secretKey } = await deriveTezosIdentity(trimmed, 0);
    const account: TezosAccount = newTezosAccount(this.crypto, tz1, publicKey);
    return this.initialiseVault(account, { kind: 'derived', index: 0 }, secretKey, password, { mnemonic: trimmed });
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
    let km: VaultKeyMaterial = {
      key:        await deriveVaultKey(password, vault.salt, vault.iterations, this.crypto),
      salt:       vault.salt,
      iterations: vault.iterations,
    };
    let raw: string;
    try {
      raw = await decryptVaultWithKey(vault, km.key, this.crypto);
    } catch {
      wipe(km.key);
      throw new Error('Incorrect password');
    }

    // The work-factor upgrade must happen here, while the password is still in
    // scope: only the derived key is retained afterwards, so no later mutation
    // could re-derive at a higher count.
    if (vault.iterations < PBKDF2_ITERATIONS) {
      const salt = freshVaultSalt(this.crypto);
      const upgraded: VaultKeyMaterial = {
        key:        await deriveVaultKey(password, salt, PBKDF2_ITERATIONS, this.crypto),
        salt,
        iterations: PBKDF2_ITERATIONS,
      };
      await this.vaultStore.save(await encryptVaultWithKey(raw, upgraded, this.crypto));
      wipe(km.key);
      km = upgraded;
    }

    const payload  = parsePayload(raw);
    const activeId = payload.active;
    const account  = payload.accounts.find(a => a.id === activeId);
    const secret   = payload.secrets[activeId];
    if (account == null || secret == null) throw new Error('Vault corrupted: active account not found');
    const secretKey = await deriveSigningKey(account, secret, payload.seed);
    this.unlocked = { account, secretKey, payload, km };
    this.activeDirty = false;
    return { session: this.unlocked, accountId: activeId };
  }

  lock(): void {
    if (this.unlocked != null) wipe(this.unlocked.km.key);
    this.unlocked = null;
    this.activeDirty = false;
  }

  async exportSecret(password: string): Promise<RevealedSecret> {
    const active = this.unlocked?.payload.active;
    if (active == null) return this.exportFromDisk(password);
    return this.exportSecretFor(active, password);
  }

  async exportSecretFor(accountId: AccountId, password: string): Promise<RevealedSecret> {
    const raw     = await this.decryptFromDisk(password);
    const payload = parsePayload(raw);
    return resolveSecretForExport(payload, accountId);
  }

  /** True when the vault holds a wallet-level seed phrase (i.e. new accounts
   *  can be derived from it). */
  hasWalletSeed(): boolean {
    return this.unlocked?.payload.seed != null;
  }

  /** Re-decrypts the vault and returns the wallet-level seed phrase. */
  async exportWalletSeed(password: string): Promise<string> {
    const raw     = await this.decryptFromDisk(password);
    const payload = parsePayload(raw);
    if (payload.seed == null) throw new NoWalletSeedError();
    return payload.seed.mnemonic;
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

    if (src.source === 'derived') {
      const seed = u.payload.seed;
      if (seed == null) throw new NoWalletSeedError();
      const index = nextDerivationIndex(u.payload, 'tezos');
      ({ tz1, publicKey } = await deriveTezosIdentity(seed.mnemonic, index));
      // Only reachable when the same key was separately imported — surface it
      // rather than silently double-listing one address.
      if (u.payload.accounts.some(a => a.kind === 'tezos' && a.tz1 === tz1)) {
        throw new DuplicateAccountError(tz1);
      }
      secret = { kind: 'derived', index };
    } else if (src.source === 'fresh') {
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
    await this.persist(addAccountToPayload(u.payload, account, secret), u.km);
    return { accountId: account.id, account, mnemonic };
  }

  async addEvmAccount(
    src: AddAccountSource,
    label?: string,
  ): Promise<{ accountId: AccountId; account: EvmAccount; privateKey?: string }> {
    const u = this.requireUnlocked();

    if (src.source === 'derived') {
      const seed = u.payload.seed;
      if (seed == null) throw new NoWalletSeedError();
      const index = nextDerivationIndex(u.payload, 'evm');
      const { address, publicKey } = await deriveEvmFromMnemonic(seed.mnemonic, index);
      if (u.payload.accounts.some(a => a.kind === 'evm' && a.address === address)) {
        throw new DuplicateAccountError(address);
      }
      const account = newEvmAccount(this.crypto, address, publicKey, label);
      await this.persist(addAccountToPayload(u.payload, account, { kind: 'derived', index }), u.km);
      return { accountId: account.id, account };
    }

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
    await this.persist(addAccountToPayload(u.payload, account, { kind: 'evm-pk', value: privateKey }), u.km);
    return { accountId: account.id, account, privateKey: returnPriv };
  }

  async removeAccount(accountId: AccountId, password: string): Promise<void> {
    const u = this.requireUnlocked();
    // Re-verify by deriving a candidate key at the retained salt/work factor
    // and comparing keys — the plaintext password is never retained.
    const candidate = await deriveVaultKey(password, u.km.salt, u.km.iterations, this.crypto);
    const ok = constantTimeEqual(candidate, u.km.key);
    wipe(candidate);
    if (!ok) throw new Error('Incorrect password');
    await this.persist(removeAccountFromPayload(u.payload, accountId), u.km);
  }

  async setActiveAccount(accountId: AccountId): Promise<void> {
    const u = this.requireUnlocked();
    const next = setActiveOnPayload(u.payload, accountId);
    if (next === u.payload) return;
    await this.persist(next, u.km);
  }

  /**
   * Flip the active account in memory only — no disk write. The active pointer
   * is not a secret, so re-sealing the whole vault (a 600k-PBKDF2 encrypt) on
   * every switch is wasted work that stalls a pure-JS runtime (mobile/Hermes has
   * no native crypto). The account/payload swap is synchronous and cheap; the
   * signing key is re-derived on demand by the container builder
   * (getSigningKeyFor), so no signing path reads the now-stale
   * unlocked.secretKey. The pointer reaches disk via a later flushActive() (or
   * the next secret-changing persist); a crash before that at worst forgets the
   * selection — the last-persisted active is restored on unlock. The extension
   * keeps setActiveAccount()'s synchronous persist (its Web Crypto makes the
   * encrypt cheap and its service worker can die at any moment); this is the
   * deferred-encrypt path a mobile switch takes.
   */
  activateInMemory(accountId: AccountId): void {
    const u = this.requireUnlocked();
    const next = setActiveOnPayload(u.payload, accountId);
    if (next === u.payload) return;
    const account = next.accounts.find(a => a.id === next.active);
    if (account == null) throw new Error('Vault corrupted after mutation');
    this.unlocked = { ...u, account, payload: next };
    this.activeDirty = true;
  }

  /** Persist a pending active-pointer change (from activateInMemory) to disk.
   *  A no-op when nothing is pending. This is the one costly step (a 600k-PBKDF2
   *  vault re-encrypt), so callers run it off the interaction path — never on the
   *  switch itself. The in-memory signing key is left untouched: no signing path
   *  reads unlocked.secretKey (the container builder re-derives via
   *  getSigningKeyFor), so it never needs refreshing here. */
  async flushActive(): Promise<void> {
    if (!this.activeDirty) return;
    const u = this.requireUnlocked();
    await this.vaultStore.save(await encryptVaultWithKey(JSON.stringify(u.payload), u.km, this.crypto));
    this.activeDirty = false;
  }

  async renameAccount(accountId: AccountId, label: string): Promise<void> {
    const u = this.requireUnlocked();
    await this.persist(renameOnPayload(u.payload, accountId, label), u.km);
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
    const secretKey = await deriveSigningKey(account, secret, u.payload.seed);
    return { account, secretKey };
  }

  async listAccountSummaries(): Promise<AccountSummary[]> {
    const secrets = this.unlocked?.payload.secrets ?? {};
    const indexOf = (id: AccountId): number | undefined => {
      const secret = secrets[id];
      return secret?.kind === 'derived' ? secret.index : undefined;
    };
    return Promise.all(this.listAccounts().map(async (a) => {
      if (a.kind === 'tezos') {
        return {
          id:               a.id,
          kind:             a.kind,
          label:            a.label,
          primaryAddress:   a.tz1,
          secondaryAddress: await deriveEvmAlias(a.tz1),
          createdAt:        a.createdAt,
          derivationIndex:  indexOf(a.id),
        } satisfies AccountSummary;
      }
      return {
        id:              a.id,
        kind:            a.kind,
        label:           a.label,
        primaryAddress:  a.address,
        createdAt:       a.createdAt,
        derivationIndex: indexOf(a.id),
      } satisfies AccountSummary;
    }));
  }

  private async initialiseVault(
    account:   Account,
    secret:    AccountSecret,
    secretKey: string,
    password:  string,
    seed?:     { mnemonic: string },
  ): Promise<UnlockedKeyring> {
    const payload: MultiAccountVaultPayload = {
      version:  3,
      ...(seed != null ? { seed } : {}),
      accounts: [account],
      active:   account.id,
      secrets:  { [account.id]: secret },
    };
    const salt = freshVaultSalt(this.crypto);
    const km: VaultKeyMaterial = {
      key:        await deriveVaultKey(password, salt, PBKDF2_ITERATIONS, this.crypto),
      salt,
      iterations: PBKDF2_ITERATIONS,
    };
    await this.vaultStore.save(await encryptVaultWithKey(JSON.stringify(payload), km, this.crypto));
    this.unlocked = { account, secretKey, payload, km };
    return this.unlocked;
  }

  private async persist(newPayload: MultiAccountVaultPayload, km: VaultKeyMaterial): Promise<void> {
    await this.vaultStore.save(await encryptVaultWithKey(JSON.stringify(newPayload), km, this.crypto));
    const active = newPayload.accounts.find(a => a.id === newPayload.active);
    const secret = newPayload.secrets[newPayload.active];
    if (active == null || secret == null) throw new Error('Vault corrupted after mutation');
    const secretKey = await deriveSigningKey(active, secret, newPayload.seed);
    this.unlocked = { account: active, secretKey, payload: newPayload, km };
    this.activeDirty = false;
  }

  private requireUnlocked(): UnlockedKeyring {
    if (this.unlocked == null) throw new Error('Wallet is locked');
    return this.unlocked;
  }

  private async exportFromDisk(password: string): Promise<RevealedSecret> {
    const raw     = await this.decryptFromDisk(password);
    const payload = parsePayload(raw);
    return resolveSecretForExport(payload, payload.active);
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

/**
 * The per-account secret handed to reveal/export flows. A `derived` marker is
 * resolved to the concrete signing material (edsk / EVM private key) — the
 * marker itself is meaningless outside this vault, and the wallet-level seed
 * has its own export path (exportWalletSeed).
 */
async function resolveSecretForExport(
  payload:   MultiAccountVaultPayload,
  accountId: AccountId,
): Promise<RevealedSecret> {
  const secret = payload.secrets[accountId];
  if (secret == null) throw new AccountNotFoundError(accountId);
  if (secret.kind !== 'derived') return secret;

  const account = payload.accounts.find(a => a.id === accountId);
  if (account == null || payload.seed == null) {
    throw new Error('Vault corrupted: derived account without a wallet seed');
  }
  if (account.kind === 'tezos') {
    const { secretKey } = await deriveTezosIdentity(payload.seed.mnemonic, secret.index);
    return { kind: 'edsk', value: secretKey };
  }
  const { privateKey } = await deriveEvmFromMnemonic(payload.seed.mnemonic, secret.index);
  return { kind: 'evm-pk', value: privateKey };
}

function newTezosAccount(crypto: CryptoPort, tz1: string, publicKey: string, label?: string): TezosAccount {
  return { kind: 'tezos', id: crypto.randomUUID(), label: normaliseLabel(label), tz1, publicKey, createdAt: Date.now() };
}

function newEvmAccount(crypto: CryptoPort, address: `0x${string}`, publicKey: `0x${string}`, label?: string): EvmAccount {
  return { kind: 'evm', id: crypto.randomUUID(), label: normaliseLabel(label), address, publicKey, createdAt: Date.now() };
}
