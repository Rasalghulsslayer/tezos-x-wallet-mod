/**
 * Vault v2 → v3 migration + the wallet-seed / derived-account flows.
 *
 * A v2 vault (per-account secrets only) must keep unlocking with the same
 * password, keep signing with byte-identical keys for all three legacy secret
 * kinds, and never gain a wallet seed by migration — the seed field is written
 * only by onboarding, because the provenance of a v2 mnemonic is unknowable.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Keyring, NoWalletSeedError } from '@tezosx/wallet-core/keyring';
import { deriveTezosIdentity, deriveTezosIdentityFromSecretKey } from '@tezosx/wallet-core/shared/seed';
import { deriveEvmAccount, deriveEvmFromMnemonic } from '@tezosx/wallet-core/shared/evm-signing';
import { WebCryptoPort } from '../../adapters/crypto/web-crypto-port';
import type { VaultStore, EncryptedVault } from '@tezosx/wallet-core/ports/vault-store';

class MemoryVaultStore implements VaultStore {
  vault: EncryptedVault | undefined;
  async load() { return this.vault; }
  async save(v: EncryptedVault) { this.vault = v; }
  async clear() { this.vault = undefined; }
}

const PASSWORD = 'correct-horse-battery';
const MNEMONIC = Array(23).fill('abandon').join(' ') + ' art';
const ALICE_EDSK = 'edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq';
const EVM_PK = '1111111111111111111111111111111111111111111111111111111111111111';

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

/** A realistic v2 payload holding all three legacy secret kinds. */
async function forgeV2Vault(password: string) {
  const tezosHd  = await deriveTezosIdentity(MNEMONIC);
  const tezosKey = await deriveTezosIdentityFromSecretKey(ALICE_EDSK);
  const evm      = deriveEvmAccount(EVM_PK);
  const now = Date.now();
  const payload = {
    version: 2,
    accounts: [
      { kind: 'tezos', id: 'acc-mnemonic', tz1: tezosHd.tz1,  publicKey: tezosHd.publicKey,  createdAt: now },
      { kind: 'tezos', id: 'acc-edsk',     tz1: tezosKey.tz1, publicKey: tezosKey.publicKey, createdAt: now + 1 },
      { kind: 'evm',   id: 'acc-evm',      address: evm.address, publicKey: evm.publicKey,   createdAt: now + 2 },
    ],
    active: 'acc-mnemonic',
    secrets: {
      'acc-mnemonic': { kind: 'mnemonic', value: MNEMONIC },
      'acc-edsk':     { kind: 'edsk',     value: ALICE_EDSK },
      'acc-evm':      { kind: 'evm-pk',   value: EVM_PK },
    },
  };
  return { vault: await forgeVault(payload, password), tezosHd, tezosKey, evm };
}

describe('keyring — v2 vault migration', () => {
  let store: MemoryVaultStore;
  let k: Keyring;
  let fixtures: Awaited<ReturnType<typeof forgeV2Vault>>;

  beforeEach(async () => {
    store = new MemoryVaultStore();
    k = new Keyring(store, new WebCryptoPort());
    fixtures = await forgeV2Vault(PASSWORD);
    store.vault = fixtures.vault;
  });

  it('unlocks with the same password and signs with byte-identical keys for all three kinds', async () => {
    await k.unlock(PASSWORD);
    expect((await k.getSigningKeyFor('acc-mnemonic')).secretKey).toBe(fixtures.tezosHd.secretKey);
    expect((await k.getSigningKeyFor('acc-edsk')).secretKey).toBe(fixtures.tezosKey.secretKey);
    expect((await k.getSigningKeyFor('acc-evm')).secretKey).toBe(fixtures.evm.privateKey);
  });

  it('migration never invents a wallet seed, so derived accounts are refused', async () => {
    await k.unlock(PASSWORD);
    expect(k.hasWalletSeed()).toBe(false);
    await expect(k.addTezosAccount({ source: 'derived' })).rejects.toThrow(NoWalletSeedError);
    await expect(k.addEvmAccount({ source: 'derived' })).rejects.toThrow(NoWalletSeedError);
    await expect(k.exportWalletSeed(PASSWORD)).rejects.toThrow(NoWalletSeedError);
  });

  it('a low-work-factor vault is re-sealed at 600k during unlock and still opens', async () => {
    // The forged fixture is sealed at 200k iterations. Only the derived key is
    // retained after unlock, so the work-factor upgrade must happen at unlock,
    // while the password is still in scope.
    expect(store.vault!.iterations).toBe(200_000);
    await k.unlock(PASSWORD);
    expect(store.vault!.iterations).toBe(600_000);

    k.lock();
    await k.unlock(PASSWORD);
    expect((await k.getSigningKeyFor('acc-mnemonic')).secretKey).toBe(fixtures.tezosHd.secretKey);
  });

  it('legacy secrets export verbatim, and a mutation re-seals as v3 that re-unlocks', async () => {
    await k.unlock(PASSWORD);
    expect(await k.exportSecretFor('acc-mnemonic', PASSWORD)).toEqual({ kind: 'mnemonic', value: MNEMONIC });
    expect(await k.exportSecretFor('acc-edsk', PASSWORD)).toEqual({ kind: 'edsk', value: ALICE_EDSK });

    await k.renameAccount('acc-evm', 'Renamed'); // re-seals the migrated payload
    k.lock();
    await k.unlock(PASSWORD);
    expect(k.listAccounts()).toHaveLength(3);
    expect(k.listAccounts().find(a => a.id === 'acc-evm')?.label).toBe('Renamed');
    expect((await k.getSigningKeyFor('acc-mnemonic')).secretKey).toBe(fixtures.tezosHd.secretKey);
  });
});

describe('keyring — wallet seed + derived accounts (new onboarding)', () => {
  let store: MemoryVaultStore;
  let k: Keyring;

  beforeEach(async () => {
    store = new MemoryVaultStore();
    k = new Keyring(store, new WebCryptoPort());
    await k.importFromMnemonic(MNEMONIC, PASSWORD);
  });

  it('onboarding keeps the index-0 address and records the phrase as the wallet seed', async () => {
    const legacy = await deriveTezosIdentity(MNEMONIC);
    expect(k.getUnlocked()!.account.kind).toBe('tezos');
    expect((k.getUnlocked()!.account as { tz1: string }).tz1).toBe(legacy.tz1);
    expect(k.hasWalletSeed()).toBe(true);
    expect(await k.exportWalletSeed(PASSWORD)).toBe(MNEMONIC);
  });

  it('derived accounts increment per-curve indices and match direct derivation', async () => {
    const t1 = await k.addTezosAccount({ source: 'derived' });
    const e0 = await k.addEvmAccount({ source: 'derived' });
    const e1 = await k.addEvmAccount({ source: 'derived' });

    expect(t1.account.tz1).toBe((await deriveTezosIdentity(MNEMONIC, 1)).tz1);
    expect(e0.account.address).toBe((await deriveEvmFromMnemonic(MNEMONIC, 0)).address);
    expect(e1.account.address).toBe((await deriveEvmFromMnemonic(MNEMONIC, 1)).address);

    const summaries = await k.listAccountSummaries();
    expect(summaries.find(s => s.id === t1.accountId)?.derivationIndex).toBe(1);
    expect(summaries.find(s => s.id === e1.accountId)?.derivationIndex).toBe(1);
  });

  it('a derived account reveals concrete signing material, never the marker', async () => {
    const t1 = await k.addTezosAccount({ source: 'derived' });
    const revealed = await k.exportSecretFor(t1.accountId, PASSWORD);
    expect(revealed.kind).toBe('edsk');
    expect(revealed.value).toBe((await deriveTezosIdentity(MNEMONIC, 1)).secretKey);

    const e0 = await k.addEvmAccount({ source: 'derived' });
    const revealedEvm = await k.exportSecretFor(e0.accountId, PASSWORD);
    expect(revealedEvm.kind).toBe('evm-pk');
  });

  it('derived accounts survive a lock/unlock round-trip and keep signing', async () => {
    const t1 = await k.addTezosAccount({ source: 'derived' });
    k.lock();
    await k.unlock(PASSWORD);
    expect((await k.getSigningKeyFor(t1.accountId)).secretKey)
      .toBe((await deriveTezosIdentity(MNEMONIC, 1)).secretKey);
  });

  it('removing the highest index then re-adding derives the same address again', async () => {
    const t1 = await k.addTezosAccount({ source: 'derived' });
    await k.removeAccount(t1.accountId, PASSWORD);
    const again = await k.addTezosAccount({ source: 'derived' });
    expect(again.account.tz1).toBe(t1.account.tz1);
  });
});
