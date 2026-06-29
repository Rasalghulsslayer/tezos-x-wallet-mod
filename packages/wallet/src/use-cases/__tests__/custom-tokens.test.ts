import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCustomToken } from '../add-custom-token';
import { removeCustomToken } from '../remove-custom-token';
import { listRegisteredTokens } from '../list-registered-tokens';
import {
  TokenAlreadyRegisteredError,
  MaxTokensReachedError,
  NotErc20Error,
  BuiltinTokenError,
  type RegisteredToken,
} from '@tezosx/wallet-core/domain/token';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import { MAX_TOKENS_PER_ACCOUNT } from '@tezosx/wallet-core/shared/constants';

class MemoryTokens implements TokenStore {
  private map = new Map<string, RegisteredToken[]>();
  async list(accountId: string) { return this.map.get(accountId) ?? []; }
  async upsert(accountId: string, t: RegisteredToken) {
    const list = this.map.get(accountId) ?? [];
    const idx  = list.findIndex(x => x.address.toLowerCase() === t.address.toLowerCase());
    this.map.set(accountId, idx === -1 ? [...list, t] : list.map((x, i) => i === idx ? t : x));
  }
  async remove(accountId: string, address: string) {
    this.map.set(accountId, (this.map.get(accountId) ?? []).filter(t => t.address.toLowerCase() !== address.toLowerCase()));
  }
  async clear() { this.map.clear(); }
  // Test helper to pre-seed
  seed(accountId: string, tokens: RegisteredToken[]) { this.map.set(accountId, tokens); }
}

const RPC = 'https://stub.rpc/';
const ACCOUNT = 'acc-1';
const ADDR = '0xd77420f73b4612a7a99dba8c2afd30a1886b0344';

function encodeUint(value: bigint): string {
  return '0x' + value.toString(16).padStart(64, '0');
}

function encodeDynamicString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const lenHex = bytes.length.toString(16).padStart(64, '0');
  let dataHex = '';
  for (const b of bytes) dataHex += b.toString(16).padStart(2, '0');
  while (dataHex.length % 64 !== 0) dataHex += '00';
  return '0x' + '20'.padStart(64, '0') + lenHex + dataHex;
}

function stubFetchMetadata(symbol: string, decimals: bigint, name: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as { params?: [{ data: string }] };
    const data = body.params?.[0]?.data ?? '';
    let result = '0x';
    if (data === '0x95d89b41') result = encodeDynamicString(symbol);
    if (data === '0x313ce567') result = encodeUint(decimals);
    if (data === '0x06fdde03') result = encodeDynamicString(name);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('addCustomToken', () => {
  let store: MemoryTokens;
  beforeEach(() => { store = new MemoryTokens(); });

  it('persists a new token after fetching metadata', async () => {
    stubFetchMetadata('USDC', 6n, 'USD Coin');
    const token = await addCustomToken({ accountId: ACCOUNT, address: ADDR }, { tokenStore: store, rpcUrl: RPC });
    expect(token.address).toBe(ADDR.toLowerCase());
    expect(token.symbol).toBe('USDC');
    expect(token.decimals).toBe(6);
    expect(await store.list(ACCOUNT)).toHaveLength(1);
  });

  it('rejects an invalid 0x address', async () => {
    await expect(
      addCustomToken({ accountId: ACCOUNT, address: 'not-an-address' }, { tokenStore: store, rpcUrl: RPC })
    ).rejects.toThrow(/Invalid 0x address/);
  });

  it('rejects a duplicate (lowercased equality)', async () => {
    stubFetchMetadata('USDC', 6n, 'USD Coin');
    await addCustomToken({ accountId: ACCOUNT, address: ADDR }, { tokenStore: store, rpcUrl: RPC });
    await expect(
      addCustomToken({ accountId: ACCOUNT, address: ADDR.toUpperCase().replace('0X', '0x') }, { tokenStore: store, rpcUrl: RPC })
    ).rejects.toBeInstanceOf(TokenAlreadyRegisteredError);
  });

  it('rejects at the cap', async () => {
    const seed: RegisteredToken[] = Array.from({ length: MAX_TOKENS_PER_ACCOUNT }, (_, i) => ({
      address:  `0x${(i + 1).toString(16).padStart(40, '0')}`,
      symbol:   `T${i}`, name: `Token ${i}`, decimals: 18, addedAt: i,
    }));
    store.seed(ACCOUNT, seed);
    await expect(
      addCustomToken({ accountId: ACCOUNT, address: ADDR }, { tokenStore: store, rpcUrl: RPC })
    ).rejects.toBeInstanceOf(MaxTokensReachedError);
  });

  it('propagates NotErc20Error without tryAnyway', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' }), { status: 200 }),
    );
    await expect(
      addCustomToken({ accountId: ACCOUNT, address: ADDR }, { tokenStore: store, rpcUrl: RPC })
    ).rejects.toBeInstanceOf(NotErc20Error);
  });

  it('accepts with tryAnyway and defaults to 18 decimals + short-address symbol', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' }), { status: 200 }),
    );
    const token = await addCustomToken(
      { accountId: ACCOUNT, address: ADDR, tryAnyway: true },
      { tokenStore: store, rpcUrl: RPC },
    );
    expect(token.decimals).toBe(18);
    expect(token.symbol).toMatch(/0xd774…0344/);
    expect(await store.list(ACCOUNT)).toHaveLength(1);
  });
});

describe('removeCustomToken', () => {
  let store: MemoryTokens;
  const NOW = 1_000_000;
  beforeEach(() => {
    store = new MemoryTokens();
    store.seed(ACCOUNT, [
      { address: '0xaaaa000000000000000000000000000000000000', symbol: 'A', name: 'A', decimals: 18, addedAt: NOW },
      { address: ADDR.toLowerCase(), symbol: 'USDC', name: 'USD Coin', decimals: 6, addedAt: NOW + 1, builtin: true },
    ]);
  });

  it('removes a non-builtin entry', async () => {
    await removeCustomToken({ accountId: ACCOUNT, address: '0xaaaa000000000000000000000000000000000000' }, { tokenStore: store });
    expect((await store.list(ACCOUNT)).map(t => t.address)).toEqual([ADDR.toLowerCase()]);
  });

  it('is a no-op on a non-registered address', async () => {
    await removeCustomToken({ accountId: ACCOUNT, address: '0x0000000000000000000000000000000000000001' }, { tokenStore: store });
    expect(await store.list(ACCOUNT)).toHaveLength(2);
  });

  it('refuses to remove a builtin', async () => {
    await expect(
      removeCustomToken({ accountId: ACCOUNT, address: ADDR }, { tokenStore: store })
    ).rejects.toBeInstanceOf(BuiltinTokenError);
  });
});

describe('listRegisteredTokens', () => {
  it('returns the snapshot sorted by addedAt ASC', async () => {
    const store = new MemoryTokens();
    store.seed(ACCOUNT, [
      { address: '0xb', symbol: 'B', name: 'B', decimals: 18, addedAt: 200 },
      { address: '0xa', symbol: 'A', name: 'A', decimals: 18, addedAt: 100 },
      { address: '0xc', symbol: 'C', name: 'C', decimals: 18, addedAt: 300 },
    ]);
    const list = await listRegisteredTokens({ accountId: ACCOUNT }, { tokenStore: store });
    expect(list.map(t => t.symbol)).toEqual(['A', 'B', 'C']);
  });

  it('returns empty for a fresh account', async () => {
    const store = new MemoryTokens();
    expect(await listRegisteredTokens({ accountId: ACCOUNT }, { tokenStore: store })).toEqual([]);
  });
});
