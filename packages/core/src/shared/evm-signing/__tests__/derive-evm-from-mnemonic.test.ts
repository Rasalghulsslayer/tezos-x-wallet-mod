import { describe, expect, it } from 'vitest';
import { deriveEvmFromMnemonic, evmDerivationPath } from '../derive-evm-from-mnemonic';
import { deriveEvmAccount, randomEvmPrivateKey } from '../derive-evm-account';

// The canonical BIP-39 test mnemonic. The expected addresses at
// m/44'/60'/0'/0/{0,1} are independently published (Ian Coleman's BIP39 tool
// and multiple wallet test suites) — a true known-answer test for the whole
// bip39 → bip32 → secp256k1 → keccak pipeline, including EIP-55 casing.
const ABANDON_MNEMONIC = Array(11).fill('abandon').join(' ') + ' about';
const ABANDON_ADDR_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const ABANDON_ADDR_1 = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';

describe('deriveEvmFromMnemonic', () => {
  it('evmDerivationPath increments the address level (non-hardened)', () => {
    expect(evmDerivationPath(0)).toBe("m/44'/60'/0'/0/0");
    expect(evmDerivationPath(3)).toBe("m/44'/60'/0'/0/3");
    expect(() => evmDerivationPath(-1)).toThrow();
    expect(() => evmDerivationPath(0.5)).toThrow();
  });

  it('derives the published address at index 0 (independent KAT)', async () => {
    const id = await deriveEvmFromMnemonic(ABANDON_MNEMONIC);
    expect(id.address).toBe(ABANDON_ADDR_0);
  });

  it('derives the published address at index 1 (independent KAT)', async () => {
    const id = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 1);
    expect(id.address).toBe(ABANDON_ADDR_1);
  });

  it('is deterministic and index-distinct', async () => {
    const a1 = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 2);
    const a2 = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 2);
    const b  = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 3);
    expect(a2.address).toBe(a1.address);
    expect(b.address).not.toBe(a1.address);
  });

  it('the derived private key round-trips through deriveEvmAccount', async () => {
    const id = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 0);
    expect(deriveEvmAccount(id.privateKey).address).toBe(id.address);
  });

  it('a random key stays independent of the HD path (no shared state)', async () => {
    const random = deriveEvmAccount(randomEvmPrivateKey());
    const hd     = await deriveEvmFromMnemonic(ABANDON_MNEMONIC, 0);
    expect(random.address).not.toBe(hd.address);
  });
});
