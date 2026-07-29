import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Keyring } from '@tezosx/wallet-core/keyring';
import { newMnemonic, deriveTezosIdentity } from '@tezosx/wallet-core/shared/seed';
import type { EncryptedVault, VaultStore } from '@tezosx/wallet-core/ports/vault-store';
import { WebCryptoPort } from '../../src/adapters/crypto/web-crypto-port';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const WALLET_ROOT  = resolve(__dirname, '../..');
const FIXTURES_DIR = resolve(WALLET_ROOT, 'e2e/fixtures/vault');
const SEED_PATH    = resolve(FIXTURES_DIR, 'seed.json');
// The committed vault-v2.encrypted.json stays frozen: the unlock spec opening
// it proves the v2 → v3 upgrade-on-read end-to-end in a real extension. This
// script emits the current payload version under its own name.
const VAULT_PATH   = resolve(FIXTURES_DIR, 'vault-v3.encrypted.json');

const TEST_PASSWORD = 'test-password-only-for-e2e';
const SEED_WARNING  = 'Test-only material. Never load this seed on mainnet or fund it with real value.';

interface SeedFile {
  mnemonic:    string;
  password:    string;
  expectedTz1: string;
  warning:     string;
}

class InMemoryVaultStore implements VaultStore {
  private current: EncryptedVault | undefined = undefined;

  async load(): Promise<EncryptedVault | undefined> {
    return this.current;
  }

  async save(v: EncryptedVault): Promise<void> {
    this.current = v;
  }

  async clear(): Promise<void> {
    this.current = undefined;
  }
}

async function loadOrGenerateSeed(): Promise<SeedFile> {
  if (existsSync(SEED_PATH)) {
    const raw  = readFileSync(SEED_PATH, 'utf-8');
    const seed = JSON.parse(raw) as SeedFile;
    console.log(`Using existing seed at ${SEED_PATH}`);
    return seed;
  }
  const mnemonic = newMnemonic();
  const { tz1 }  = await deriveTezosIdentity(mnemonic);
  const seed: SeedFile = {
    mnemonic,
    password:    TEST_PASSWORD,
    expectedTz1: tz1,
    warning:     SEED_WARNING,
  };
  writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`, 'utf-8');
  console.log(`Generated fresh seed at ${SEED_PATH}`);
  return seed;
}

async function main(): Promise<void> {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  const force = process.argv.includes('--force');
  if (existsSync(VAULT_PATH) && !force) {
    console.log(`Vault already exists at ${VAULT_PATH}. Pass --force to regenerate.`);
    return;
  }

  const seed    = await loadOrGenerateSeed();
  const store   = new InMemoryVaultStore();
  const keyring = new Keyring(store, new WebCryptoPort());
  await keyring.importFromMnemonic(seed.mnemonic, seed.password);

  const vault = await store.load();
  if (vault == null) throw new Error('Keyring did not persist an encrypted vault');

  writeFileSync(VAULT_PATH, `${JSON.stringify(vault, null, 2)}\n`, 'utf-8');
  console.log(`Wrote encrypted vault to ${VAULT_PATH}`);
  console.log(`  tz1: ${seed.expectedTz1}`);
}

main().catch((e: unknown) => {
  console.error('gen-vault error:', e);
  process.exit(1);
});
