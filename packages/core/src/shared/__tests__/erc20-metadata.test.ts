import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchErc20Metadata } from '../erc20-metadata';
import { NotErc20Error } from '../../domain/token';

const RPC = 'https://stub.rpc/';
const ADDR = '0xd77420f73b4612a7a99dba8c2afd30a1886b0344';

// Helpers to craft eth_call return values

function encodeUint(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

function encodeDynamicString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const lenHex = bytes.length.toString(16).padStart(64, '0');
  let dataHex = '';
  for (const b of bytes) dataHex += b.toString(16).padStart(2, '0');
  // pad data to a multiple of 32 bytes (64 hex chars)
  while (dataHex.length % 64 !== 0) dataHex += '00';
  return '0x' + '20'.padStart(64, '0') + lenHex + dataHex;
}

function encodeBytes32(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  while (hex.length < 64) hex += '00';
  return '0x' + hex.slice(0, 64);
}

const SELECTOR_SYMBOL   = '0x95d89b41';
const SELECTOR_DECIMALS = '0x313ce567';
const SELECTOR_NAME     = '0x06fdde03';

function stubFetch(responses: Record<string, string | { error: string } | 'reject'>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as { params?: [{ data: string }] };
    const data = body.params?.[0]?.data ?? '';
    const r = responses[data];
    if (r === 'reject') throw new Error('network error');
    if (typeof r === 'object' && 'error' in r) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: r.error } }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: r }), { status: 200 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('fetchErc20Metadata', () => {
  it('reads clean string-encoded symbol + name + decimals', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   encodeDynamicString('USDC'),
      [SELECTOR_DECIMALS]: encodeUint(6n),
      [SELECTOR_NAME]:     encodeDynamicString('USD Coin'),
    });
    const m = await fetchErc20Metadata(ADDR, RPC);
    expect(m).toEqual({ symbol: 'USDC', name: 'USD Coin', decimals: 6 });
  });

  it('decodes bytes32-encoded symbol (MakerDAO pattern)', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   encodeBytes32('MKR'),
      [SELECTOR_DECIMALS]: encodeUint(18n),
      [SELECTOR_NAME]:     encodeBytes32('Maker'),
    });
    const m = await fetchErc20Metadata(ADDR, RPC);
    expect(m).toEqual({ symbol: 'MKR', name: 'Maker', decimals: 18 });
  });

  it('falls back name to symbol when name() returns 0x', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   encodeDynamicString('UNK'),
      [SELECTOR_DECIMALS]: encodeUint(18n),
      [SELECTOR_NAME]:     '0x',
    });
    const m = await fetchErc20Metadata(ADDR, RPC);
    expect(m.name).toBe('UNK');
  });

  it('falls back symbol to short-address when symbol() rejects', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   'reject',
      [SELECTOR_DECIMALS]: encodeUint(18n),
      [SELECTOR_NAME]:     encodeDynamicString('Some Token'),
    });
    const m = await fetchErc20Metadata(ADDR, RPC);
    expect(m.symbol).toMatch(/0xd774…0344/);
    expect(m.decimals).toBe(18);
  });

  it('throws NotErc20Error when decimals() rejects', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   encodeDynamicString('X'),
      [SELECTOR_DECIMALS]: 'reject',
      [SELECTOR_NAME]:     encodeDynamicString('X Token'),
    });
    await expect(fetchErc20Metadata(ADDR, RPC)).rejects.toBeInstanceOf(NotErc20Error);
  });

  it('throws NotErc20Error when decimals() returns 0x', async () => {
    stubFetch({
      [SELECTOR_SYMBOL]:   encodeDynamicString('X'),
      [SELECTOR_DECIMALS]: '0x',
      [SELECTOR_NAME]:     encodeDynamicString('X'),
    });
    await expect(fetchErc20Metadata(ADDR, RPC)).rejects.toBeInstanceOf(NotErc20Error);
  });
});
