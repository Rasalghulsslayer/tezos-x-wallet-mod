import { describe, it, expect } from 'vitest';
import { deriveTezosIdentity } from '@tezosx/wallet-core/shared/seed';
import { deriveEvmAccount } from '@tezosx/wallet-core/shared/evm-signing';
import {
  buildAddAccountSource,
  derivePreviewPrimary,
  derivePrimaryFromImport,
  findDuplicate,
  importShapeValid,
  importWordCount,
} from '../add-account-helpers';

// Standard BIP39 test vector — checksum-valid 12 words.
const MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// In secp256k1 range; the address is fully determined by the key.
const EVM_KEY = '11'.repeat(32);
// Above the secp256k1 group order n — plausible shape, unusable key.
const EVM_KEY_OUT_OF_RANGE = 'ff'.repeat(32);

describe('importShapeValid', () => {
  it('accepts a checksum-valid mnemonic, case- and whitespace-insensitively', () => {
    expect(importShapeValid('tezos', 'mnemonic', MNEMONIC)).toBe(true);
    expect(importShapeValid('tezos', 'mnemonic', `  ${MNEMONIC.toUpperCase()}  `)).toBe(true);
  });

  it('rejects a wrong word count and an empty paste', () => {
    expect(importShapeValid('tezos', 'mnemonic', 'abandon abandon about')).toBe(false);
    expect(importShapeValid('tezos', 'mnemonic', '')).toBe(false);
    expect(importShapeValid('tezos', 'mnemonic', '   ')).toBe(false);
  });

  it('routes the tezos check through the selected mode — a mnemonic is not a valid edsk', () => {
    expect(importShapeValid('tezos', 'edsk', MNEMONIC)).toBe(false);
    expect(importShapeValid('tezos', 'edsk', 'edsk-not-base58')).toBe(false);
  });

  it('accepts a 64-hex EVM key with or without the 0x prefix', () => {
    expect(importShapeValid('evm', 'mnemonic', EVM_KEY)).toBe(true);
    expect(importShapeValid('evm', 'mnemonic', `0x${EVM_KEY}`)).toBe(true);
  });

  it('rejects short or non-hex EVM keys', () => {
    expect(importShapeValid('evm', 'mnemonic', EVM_KEY.slice(0, 62))).toBe(false);
    expect(importShapeValid('evm', 'mnemonic', 'zz'.repeat(32))).toBe(false);
  });
});

describe('importWordCount', () => {
  it('counts words across arbitrary whitespace', () => {
    expect(importWordCount('  alpha   beta\n gamma\t')).toBe(3);
    expect(importWordCount(MNEMONIC)).toBe(12);
  });
});

describe('derivePrimaryFromImport', () => {
  it('derives the same tz1 the keyring would for a pasted mnemonic (lowercased)', async () => {
    const { tz1 } = await deriveTezosIdentity(MNEMONIC);
    await expect(derivePrimaryFromImport('tezos', 'mnemonic', `  ${MNEMONIC.toUpperCase()} `)).resolves.toBe(tz1);
  });

  it('derives the tz1 of a pasted edsk (round-trips with the mnemonic identity)', async () => {
    const { tz1, secretKey } = await deriveTezosIdentity(MNEMONIC);
    await expect(derivePrimaryFromImport('tezos', 'edsk', secretKey)).resolves.toBe(tz1);
  });

  it('derives the checksummed 0x address of a pasted EVM key, prefix-insensitively', async () => {
    const expected = deriveEvmAccount(EVM_KEY).address;
    await expect(derivePrimaryFromImport('evm', 'mnemonic', EVM_KEY)).resolves.toBe(expected);
    await expect(derivePrimaryFromImport('evm', 'mnemonic', `0x${EVM_KEY.toUpperCase()}`)).resolves.toBe(expected);
  });

  it('returns null while the shape is invalid instead of throwing', async () => {
    await expect(derivePrimaryFromImport('tezos', 'mnemonic', 'abandon abandon')).resolves.toBeNull();
    await expect(derivePrimaryFromImport('evm', 'mnemonic', '0x1234')).resolves.toBeNull();
  });

  it('throws on a plausible-shaped but out-of-range EVM key (surfaced as a parse error)', async () => {
    await expect(derivePrimaryFromImport('evm', 'mnemonic', EVM_KEY_OUT_OF_RANGE)).rejects.toThrow();
  });
});

describe('derivePreviewPrimary', () => {
  it('returns null for a derived source — the seed never leaves the keyring', async () => {
    await expect(
      derivePreviewPrimary({ kind: 'tezos', source: 'derived', tzMode: 'mnemonic', fresh: '', importRaw: '' }),
    ).resolves.toBeNull();
  });

  it('previews a fresh EVM key and a fresh tezos mnemonic', async () => {
    const evm = await derivePreviewPrimary({
      kind: 'evm', source: 'fresh', tzMode: 'mnemonic', fresh: EVM_KEY, importRaw: '',
    });
    expect(evm).toBe(deriveEvmAccount(EVM_KEY).address);

    const { tz1 } = await deriveTezosIdentity(MNEMONIC);
    const tez = await derivePreviewPrimary({
      kind: 'tezos', source: 'fresh', tzMode: 'mnemonic', fresh: MNEMONIC, importRaw: '',
    });
    expect(tez).toBe(tz1);
  });

  it('routes an import source through the pasted secret', async () => {
    const expected = deriveEvmAccount(EVM_KEY).address;
    await expect(
      derivePreviewPrimary({ kind: 'evm', source: 'import', tzMode: 'mnemonic', fresh: '', importRaw: `0x${EVM_KEY}` }),
    ).resolves.toBe(expected);
  });
});

describe('findDuplicate', () => {
  const accounts = [
    { id: 'a1', tz1: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb' },
    { id: 'a2', address: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A' },
  ];

  it('matches a tz1 primary and a checksummed 0x case-insensitively', () => {
    expect(findDuplicate(accounts, 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb')?.id).toBe('a1');
    expect(findDuplicate(accounts, '0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a')?.id).toBe('a2');
  });

  it('returns null when the derived address is not in the vault', () => {
    expect(findDuplicate(accounts, '0x' + '0'.repeat(40))).toBeNull();
    expect(findDuplicate([], 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb')).toBeNull();
  });
});

describe('buildAddAccountSource', () => {
  it('maps a derived pick to the bare derived source', () => {
    expect(
      buildAddAccountSource({ kind: 'tezos', source: 'derived', tzMode: 'mnemonic', fresh: '', importRaw: '' }),
    ).toEqual({ source: 'derived' });
  });

  it('submits the revealed fresh secret itself — never source:"fresh"', () => {
    expect(
      buildAddAccountSource({ kind: 'tezos', source: 'fresh', tzMode: 'mnemonic', fresh: MNEMONIC, importRaw: '' }),
    ).toEqual({ source: 'mnemonic', mnemonic: MNEMONIC });
    expect(
      buildAddAccountSource({ kind: 'evm', source: 'fresh', tzMode: 'mnemonic', fresh: EVM_KEY, importRaw: '' }),
    ).toEqual({ source: 'privkey', privateKey: EVM_KEY });
  });

  it('lowercases an imported mnemonic (matching keyring validation) and keeps an edsk as-is', () => {
    expect(
      buildAddAccountSource({
        kind: 'tezos', source: 'import', tzMode: 'mnemonic', fresh: '', importRaw: ` ${MNEMONIC.toUpperCase()} `,
      }),
    ).toEqual({ source: 'mnemonic', mnemonic: MNEMONIC });

    const edsk = 'edsk' + 'X'.repeat(50);
    expect(
      buildAddAccountSource({ kind: 'tezos', source: 'import', tzMode: 'edsk', fresh: '', importRaw: ` ${edsk} ` }),
    ).toEqual({ source: 'edsk', edsk });
  });

  it('normalises an imported EVM key to unprefixed lowercase hex', () => {
    expect(
      buildAddAccountSource({
        kind: 'evm', source: 'import', tzMode: 'mnemonic', fresh: '', importRaw: `0x${EVM_KEY.toUpperCase()}`,
      }),
    ).toEqual({ source: 'privkey', privateKey: EVM_KEY });
  });
});
