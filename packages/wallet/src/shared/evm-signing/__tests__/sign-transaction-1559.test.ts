import { describe, it, expect } from 'vitest';
import { signTransaction1559, type EvmTx1559 } from '../sign-transaction-1559';

// Independent reference: raw signed EIP-1559 transactions produced by viem
// (`privateKeyToAccount(...).signTransaction`) for the Hardhat #1 test key.
// viem is a separate implementation and is NOT a wallet dependency — these
// vectors were generated offline. The hand-rolled signer must reproduce them
// byte-for-byte (lowS, RFC-6979 deterministic, yParity not legacy v).
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TO = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

const BARE =
  '0x02f8748301f47b80843b9aca0084773594008252089470997970c51812dc3a010c7d01b50e0d17dc79c887038d7ea4c6800080c001a009f22b6ab1272ee446e991bb1e9fd53305f6630cd9dea16c5ee63ccd06311f75a04352554b4c0f9602c7ed920f153ea6383ad08b949632a49be867fbf190c460c6';

const WITH_DATA =
  '0x02f8b38301f47b078459682f0084b2d05e0083015f909470997970c51812dc3a010c7d01b50e0d17dc79c880b844a9059cbb00000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000000000064c080a05f0fe7c64e099ee11284b2a1a68e2af29a59f2190a6af8f4ca2680bdaa7328d3a01cfe7011472400ffc479de35731eaf24e3b73402d4348dd08c0fbef376958745';

const WITH_ACCESS_LIST =
  '0x02f8c98301f47b01843b9aca00847735940082c3509470997970c51812dc3a010c7d01b50e0d17dc79c82a80f85bf8599470997970c51812dc3a010c7d01b50e0d17dc79c8f842a00000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000780a0b1cbffe1f7883d44c4d98986649c0d88e04fd82b3cb879e46e99a2fed9532d6aa01bde891ad9f23be58aed1b91e941ed49fda89a04a1d8be3daf295c01b3b93266';

const DATA =
  ('0xa9059cbb000000000000000000000000' + '11'.repeat(20) + '00'.repeat(31) + '64') as `0x${string}`;

describe('signTransaction1559 — known-answer vectors (viem reference)', () => {
  it('bare transfer (nonce 0 → leading-zero trimmed to empty RLP) matches viem', () => {
    const tx: EvmTx1559 = {
      chainId: 128123n, nonce: 0n,
      maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas: 2_000_000_000n,
      gasLimit: 21000n, to: TO, value: 1_000_000_000_000_000n, data: '0x',
    };
    expect(signTransaction1559(tx, PK)).toBe(BARE);
  });

  it('contract call with calldata and zero value matches viem', () => {
    const tx: EvmTx1559 = {
      chainId: 128123n, nonce: 7n,
      maxPriorityFeePerGas: 1_500_000_000n, maxFeePerGas: 3_000_000_000n,
      gasLimit: 90000n, to: TO, value: 0n, data: DATA,
    };
    expect(signTransaction1559(tx, PK)).toBe(WITH_DATA);
  });

  it('transaction with a non-empty access list matches viem', () => {
    const tx: EvmTx1559 = {
      chainId: 128123n, nonce: 1n,
      maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas: 2_000_000_000n,
      gasLimit: 50000n, to: TO, value: 42n, data: '0x',
      accessList: [{
        address: TO,
        storageKeys: [
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000000000000000000000000007',
        ],
      }],
    };
    expect(signTransaction1559(tx, PK)).toBe(WITH_ACCESS_LIST);
  });

  it('emits a typed 0x02 envelope and is deterministic (RFC-6979)', () => {
    const tx: EvmTx1559 = {
      chainId: 128123n, nonce: 0n,
      maxPriorityFeePerGas: 1_000_000_000n, maxFeePerGas: 2_000_000_000n,
      gasLimit: 21000n, to: TO, value: 1_000_000_000_000_000n, data: '0x',
    };
    expect(signTransaction1559(tx, PK).startsWith('0x02')).toBe(true);
    expect(signTransaction1559(tx, PK)).toBe(signTransaction1559(tx, PK));
  });
});
