import { describe, expect, it, beforeEach } from 'vitest';
import { Keyring } from '../../background/keyring';
import {
  CannotRemoveLastAccountError,
  AccountNotFoundError,
  MaxAccountsReachedError,
} from '../../domain/vault';
import { MAX_ACCOUNTS_PER_VAULT, MAX_LABEL_LENGTH } from '../../shared/constants';
import { addAccount } from '../add-account';
import { removeAccount } from '../remove-account';
import { setActiveAccount } from '../set-active-account';
import { renameAccount } from '../rename-account';
import { listAccounts } from '../list-accounts';
import type { VaultStore, EncryptedVault } from '../../ports/vault-store';

class MemoryVaultStore implements VaultStore {
  private vault: EncryptedVault | undefined;
  async load()                          { return this.vault; }
  async save(v: EncryptedVault)         { this.vault = v; }
  async clear()                         { this.vault = undefined; }
}

const PASSWORD = 'correct-horse-battery';

async function setupWithOneTezosAccount(): Promise<{ keyring: Keyring; firstId: string }> {
  const keyring = new Keyring(new MemoryVaultStore());
  await keyring.create(PASSWORD);
  const firstId = keyring.getUnlocked()!.account.id;
  return { keyring, firstId };
}

describe('addAccount use case', () => {
  it('appends a fresh Tezos account; active unchanged; secret returned for blurred reveal', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const result = await addAccount({ kind: 'tezos', source: { source: 'fresh' } }, { keyring });
    expect(result.account.kind).toBe('tezos');
    expect(result.accountId).not.toBe(firstId);
    expect(result.secret).toMatch(/\w+( \w+){11}/); // 12-word mnemonic
    expect(keyring.listAccounts()).toHaveLength(2);
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });

  it('appends a fresh EVM account', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const result = await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    expect(result.account.kind).toBe('evm');
    expect(result.secret).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(keyring.listAccounts()).toHaveLength(2);
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });

  it('appends an EVM account from a privkey (no returned secret)', async () => {
    const { keyring } = await setupWithOneTezosAccount();
    const priv  = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
    const r     = await addAccount({ kind: 'evm', source: { source: 'privkey', privateKey: priv } }, { keyring });
    expect(r.secret).toBeUndefined();
    expect(keyring.listAccounts().find(a => a.id === r.accountId)?.kind).toBe('evm');
  });

  it('throws MaxAccountsReachedError at the cap', async () => {
    const { keyring } = await setupWithOneTezosAccount();
    for (let i = 1; i < MAX_ACCOUNTS_PER_VAULT; i++) {
      await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    }
    expect(keyring.listAccounts()).toHaveLength(MAX_ACCOUNTS_PER_VAULT);
    await expect(
      addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring })
    ).rejects.toBeInstanceOf(MaxAccountsReachedError);
  });
});

describe('removeAccount use case', () => {
  it('removes a non-active account; active unchanged', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const { accountId: secondId } = await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    await removeAccount({ accountId: secondId, password: PASSWORD }, { keyring });
    expect(keyring.listAccounts()).toHaveLength(1);
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });

  it('removes the active account; active flips to the next createdAt-ASC peer', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const { accountId: secondId } = await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    await removeAccount({ accountId: firstId, password: PASSWORD }, { keyring });
    expect(keyring.listAccounts().map(a => a.id)).toEqual([secondId]);
    expect(keyring.getUnlocked()!.payload.active).toBe(secondId);
    expect(keyring.getUnlocked()!.account.id).toBe(secondId);
  });

  it('throws CannotRemoveLastAccountError on the only account', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    await expect(
      removeAccount({ accountId: firstId, password: PASSWORD }, { keyring })
    ).rejects.toBeInstanceOf(CannotRemoveLastAccountError);
  });

  it('throws on wrong password (vault unchanged)', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const { accountId: secondId } = await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    await expect(
      removeAccount({ accountId: secondId, password: 'wrong-password' }, { keyring })
    ).rejects.toThrow(/Incorrect password/);
    expect(keyring.listAccounts()).toHaveLength(2);
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });
});

describe('setActiveAccount use case', () => {
  it('flips the active account', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    const { accountId: secondId } = await addAccount({ kind: 'evm', source: { source: 'fresh' } }, { keyring });
    await setActiveAccount({ accountId: secondId }, { keyring });
    expect(keyring.getUnlocked()!.payload.active).toBe(secondId);
    expect(keyring.getUnlocked()!.account.id).toBe(secondId);
    // Switching back works too.
    await setActiveAccount({ accountId: firstId }, { keyring });
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });

  it('is a no-op when the target is already active', async () => {
    const { keyring, firstId } = await setupWithOneTezosAccount();
    await setActiveAccount({ accountId: firstId }, { keyring });
    expect(keyring.getUnlocked()!.payload.active).toBe(firstId);
  });

  it('throws AccountNotFoundError for an unknown id', async () => {
    const { keyring } = await setupWithOneTezosAccount();
    await expect(
      setActiveAccount({ accountId: 'no-such-id' }, { keyring })
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe('renameAccount use case', () => {
  let keyring: Keyring;
  let firstId: string;
  beforeEach(async () => {
    ({ keyring, firstId } = await setupWithOneTezosAccount());
  });

  it('sets a label', async () => {
    await renameAccount({ accountId: firstId, label: 'Trading' }, { keyring });
    expect(keyring.listAccounts()[0].label).toBe('Trading');
  });

  it('clears a label with the empty string', async () => {
    await renameAccount({ accountId: firstId, label: 'Tmp' }, { keyring });
    await renameAccount({ accountId: firstId, label: '' }, { keyring });
    expect(keyring.listAccounts()[0].label).toBeUndefined();
  });

  it('throws when label is too long', async () => {
    const long = 'x'.repeat(MAX_LABEL_LENGTH + 1);
    await expect(
      renameAccount({ accountId: firstId, label: long }, { keyring })
    ).rejects.toThrow(/Label too long/);
  });
});

describe('listAccounts use case', () => {
  it('returns AccountSummary[] sorted by createdAt ASC, with secondaryAddress for Tezos accounts', async () => {
    const { keyring } = await setupWithOneTezosAccount();
    await addAccount({ kind: 'evm',   source: { source: 'fresh' } }, { keyring });
    await addAccount({ kind: 'tezos', source: { source: 'fresh' } }, { keyring });
    const summaries = await listAccounts({ keyring });

    expect(summaries).toHaveLength(3);
    expect(summaries.map(s => s.kind)).toEqual(['tezos', 'evm', 'tezos']);
    expect(summaries[0].secondaryAddress).toMatch(/^0x/);   // Tezos → alias
    expect(summaries[1].secondaryAddress).toBeUndefined();  // EVM   → none
    // createdAt ASC
    expect(summaries[0].createdAt).toBeLessThanOrEqual(summaries[1].createdAt);
    expect(summaries[1].createdAt).toBeLessThanOrEqual(summaries[2].createdAt);
  });
});
