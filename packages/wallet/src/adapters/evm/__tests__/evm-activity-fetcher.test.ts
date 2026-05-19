import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EvmActivityFetcher,
  decodePrecompileTransferInput,
} from '../evm-activity-fetcher';
import mixed from '../__fixtures__/blockscout-mixed.json';

const HOLDER = '0x3136Ecd7C0CcCf17fCC821e610B1d9b1865a78e4';

function mockFetchEnvelope(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
}

describe('EvmActivityFetcher', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('flags a precompile call as evm-to-tezos cross-runtime', async () => {
    mockFetchEnvelope({ message: 'OK', result: [mixed.result[0]] });
    const page = await new EvmActivityFetcher().list({ holder: HOLDER, limit: 10 });
    const it0 = page.items[0];
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.runtime).toBe('cross-runtime');
    expect(it0.counterparty).toBe('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx');
    expect(it0.amount).toBe('1000000000000000000');
    expect(it0.crossRuntime?.direction).toBe('evm-to-tezos');
    expect(it0.crossRuntime?.l2TxHash).toBe(mixed.result[0].hash);
    expect(it0.crossRuntime?.evmEffectStatus).toBe('confirmed');
  });

  it('parses a native EVM receive', async () => {
    mockFetchEnvelope({ message: 'OK', result: [mixed.result[1]] });
    const page = await new EvmActivityFetcher().list({ holder: HOLDER, limit: 10 });
    const it0 = page.items[0];
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.runtime).toBe('l2');
    expect(it0.direction).toBe('received');
    expect(it0.counterparty).toBe('0x6ce4d79d4e77402e1ef3417fdda433aa744c6e1c');
    expect(it0.amount).toBe('2000000000000000000');
    expect(it0.crossRuntime).toBeUndefined();
  });

  it('parses a non-precompile contract call (e.g. ERC-20 approve)', async () => {
    mockFetchEnvelope({ message: 'OK', result: [mixed.result[2]] });
    const page = await new EvmActivityFetcher().list({ holder: HOLDER, limit: 10 });
    const it0 = page.items[0];
    expect(it0.kind).toBe('contract-call');
    if (it0.kind !== 'contract-call') return;
    expect(it0.target).toBe('0xd77420f73b4612a7a99dba8c2afd30a1886b0344');
    expect(it0.methodSig).toBe('0x095ea7b3');
  });

  it('emits a cursor only when the response fills the limit', async () => {
    mockFetchEnvelope(mixed);
    const page = await new EvmActivityFetcher().list({ holder: HOLDER, limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.cursor).toBe('2');                                 // next page
  });

  it('omits the cursor when the response is short of the limit', async () => {
    mockFetchEnvelope(mixed);
    const page = await new EvmActivityFetcher().list({ holder: HOLDER, limit: 25 });
    expect(page.cursor).toBeUndefined();
  });

  it('throws on Blockscout rate-limit envelopes', async () => {
    mockFetchEnvelope({ status: '0', message: 'NOTOK', result: 'Maximum rate limit reached' });
    await expect(new EvmActivityFetcher().list({ holder: HOLDER, limit: 25 })).rejects.toThrow(/NOTOK|Maximum rate/);
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 502 })));
    await expect(new EvmActivityFetcher().list({ holder: HOLDER, limit: 25 })).rejects.toThrow(/Blockscout HTTP 502/);
  });
});

describe('decodePrecompileTransferInput', () => {
  it('decodes the canonical wallet-side input (tz1 of 36 chars)', () => {
    const input = '0xa0258d0b'
      + '0000000000000000000000000000000000000000000000000000000000000020'
      + '0000000000000000000000000000000000000000000000000000000000000024'
      + '747a314b715470455a37596f62375162504534487934576f38664847384c684b785a537800000000000000000000000000000000000000000000000000000000';
    expect(decodePrecompileTransferInput(input)).toBe('tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx');
  });

  it('returns null for too-short input', () => {
    expect(decodePrecompileTransferInput('0xa0258d0b')).toBeNull();
  });

  it('returns null when length is implausible', () => {
    const input = '0xa0258d0b'
      + '0000000000000000000000000000000000000000000000000000000000000020'
      + '0000000000000000000000000000000000000000000000000000000000000fff'
      + '00';
    expect(decodePrecompileTransferInput(input)).toBeNull();
  });

  it('returns null when the payload bytes are non-ASCII', () => {
    const input = '0xa0258d0b'
      + '0000000000000000000000000000000000000000000000000000000000000020'
      + '0000000000000000000000000000000000000000000000000000000000000004'
      + 'ff80fe7f' + '0'.repeat(56);
    expect(decodePrecompileTransferInput(input)).toBeNull();
  });

  it('accepts the input without the 0x prefix', () => {
    const input = 'a0258d0b'
      + '0000000000000000000000000000000000000000000000000000000000000020'
      + '0000000000000000000000000000000000000000000000000000000000000003'
      + '74657374' + '0'.repeat(56);                              // 'test'
    expect(decodePrecompileTransferInput(input)).toBe('tes');     // length=3 truncates the 'test'
  });
});
