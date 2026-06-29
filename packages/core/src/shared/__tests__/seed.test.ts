import { describe, it, expect } from 'vitest';
import {
  deriveTezosIdentity,
  deriveTezosIdentityFromSecretKey,
  newMnemonic,
  TEZOS_DERIVATION_PATH,
  MNEMONIC_WORDS,
} from '../seed';

// Independent published vector: the canonical Flextesa / sandbox "alice"
// keypair, derived by octez (the reference Tezos implementation) and reproduced
// across the ecosystem — NOT by this code. Pins the ed25519 pubkey → tz1
// encoding (blake2b-160 + base58check), the step that yields a wrong address if
// it drifts.
const ALICE_EDSK = 'edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq';
const ALICE_TZ1  = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const ALICE_EDPK = 'edpkvGfYw3LyB1UcCahKQk4rF2tvbMUk8GFiTuMjL75uGXrpvKXhjn';

// Valid 24-word BIP-39 mnemonic (256-bit zero entropy). Used for structural and
// determinism checks of the HD path — not as a hard tz1 vector.
const ZERO_MNEMONIC = Array(23).fill('abandon').join(' ') + ' art';

describe('seed — Tezos identity derivation', () => {
  it('derives the published alice tz1 + edpk from its edsk (independent KAT)', async () => {
    const id = await deriveTezosIdentityFromSecretKey(ALICE_EDSK);
    expect(id.tz1).toBe(ALICE_TZ1);
    expect(id.publicKey).toBe(ALICE_EDPK);
  });

  it('mnemonic derivation yields a well-formed tz1 / edpk / edsk triple', async () => {
    const id = await deriveTezosIdentity(ZERO_MNEMONIC);
    expect(id.tz1).toMatch(/^tz1/);
    expect(id.publicKey).toMatch(/^edpk/);
    expect(id.secretKey).toMatch(/^edsk/);
  });

  it('mnemonic derivation is deterministic', async () => {
    const a = await deriveTezosIdentity(ZERO_MNEMONIC);
    const b = await deriveTezosIdentity(ZERO_MNEMONIC);
    expect(b.tz1).toBe(a.tz1);
  });

  it('the derived edsk round-trips to the same identity (path ⇄ direct-key agree)', async () => {
    const fromMnemonic = await deriveTezosIdentity(ZERO_MNEMONIC);
    const fromKey      = await deriveTezosIdentityFromSecretKey(fromMnemonic.secretKey);
    expect(fromKey.tz1).toBe(fromMnemonic.tz1);
    expect(fromKey.publicKey).toBe(fromMnemonic.publicKey);
  });

  it('distinct mnemonics yield distinct tz1 addresses', async () => {
    const a = await deriveTezosIdentity(ZERO_MNEMONIC);
    const b = await deriveTezosIdentity(newMnemonic());
    expect(b.tz1).not.toBe(a.tz1);
  });

  it('newMnemonic produces a 24-word mnemonic', () => {
    expect(newMnemonic().trim().split(/\s+/)).toHaveLength(MNEMONIC_WORDS);
  });

  it('uses the standard Tezos BIP44 ed25519 path', () => {
    expect(TEZOS_DERIVATION_PATH).toBe("m/44'/1729'/0'/0'");
  });
});
