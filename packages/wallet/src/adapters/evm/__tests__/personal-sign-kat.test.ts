/**
 * Known-answer tests for EVM signing (#45), with the reference values produced
 * by viem (`privateKeyToAccount` + `signMessage`) for Hardhat test key #1.
 *
 * These pin the EIP-55 address derivation and the EIP-191 `personal_sign`
 * output, and guard the #17 regression: the provider must sign the *decoded*
 * bytes of a hex `personal_sign` param, not the literal hex string.
 */
import { describe, it, expect } from 'vitest';
import { EvmProvider } from '../evm-provider';
import { EvmSigner } from '../evm-signer';
import {
  deriveEvmAccount,
  normalizePersonalSignMessage,
  signPersonalMessage,
} from '../../../shared/evm-signing';
import type { EvmAccount } from '../../../domain/account';

// Reference vectors (viem). Hardhat test account #1.
const PK        = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDR      = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const HELLO_HEX = '0x48656c6c6f'; // "Hello"
const SIG_HELLO =
  '0x4e2d8315ad7a7feb00de8fa9864d50fda928fbee0498c9caf30661ffcc2744a0' +
  '059c96376c10d877d80aef6fded3b8de77d4d213889dece77a7882cdb079d1b71c';

describe('EVM signing — known-answer vectors (viem reference)', () => {
  it('derives the EIP-55 checksummed address', () => {
    expect(deriveEvmAccount(PK).address).toBe(ADDR);
  });

  it('normalizePersonalSignMessage decodes a hex param to its raw bytes', () => {
    expect(Array.from(normalizePersonalSignMessage(HELLO_HEX)))
      .toEqual(Array.from(new TextEncoder().encode('Hello')));
  });

  it('signPersonalMessage over the decoded hex matches viem (EIP-191)', () => {
    expect(signPersonalMessage(normalizePersonalSignMessage(HELLO_HEX), PK)).toBe(SIG_HELLO);
  });

  it('signPersonalMessage over a non-hex utf8 param also matches viem', () => {
    expect(signPersonalMessage(normalizePersonalSignMessage('Hello'), PK)).toBe(SIG_HELLO);
  });

  it('EvmProvider.personal_sign signs the decoded message, not the hex string (regression #17)', async () => {
    const id = deriveEvmAccount(PK);
    const account: EvmAccount = {
      kind:      'evm',
      id:        'kat',
      address:   id.address,
      publicKey: id.publicKey,
      createdAt: 0,
    };
    const provider = new EvmProvider(new EvmSigner(account, PK), 'http://localhost:0');
    const sig = await provider.request({ method: 'personal_sign', params: [HELLO_HEX, ADDR] });
    expect(sig).toBe(SIG_HELLO);
  });
});
