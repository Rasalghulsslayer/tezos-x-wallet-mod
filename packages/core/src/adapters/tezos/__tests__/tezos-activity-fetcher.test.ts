import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TezosActivityFetcher } from '../tezos-activity-fetcher';
import mixed from '../__fixtures__/tzkt-mixed.json';

const HOLDER = 'tz1ibrntf432pX3p4zvXg9Z7vN4T539HWeYD';

function mockFetch(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
}

describe('TezosActivityFetcher', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('parses a native self-transfer (sender === target === holder)', async () => {
    mockFetch([mixed[0]]);
    const page = await new TezosActivityFetcher().list({ holder: HOLDER, limit: 10 });
    expect(page.items).toHaveLength(1);
    const it0 = page.items[0];
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.runtime).toBe('l1');
    expect(it0.direction).toBe('self');
    expect(it0.amount).toBe('1000000');
    expect(it0.id).toBe('l1:103124303872');
    expect(it0.crossRuntime).toBeUndefined();
  });

  it('flags a NAC gateway call as cross-runtime candidate', async () => {
    mockFetch([mixed[1]]);
    const page = await new TezosActivityFetcher().list({ holder: HOLDER, limit: 10 });
    const it0 = page.items[0];
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.runtime).toBe('l1');
    expect(it0.direction).toBe('sent');
    expect(it0.counterparty).toBe('0xAfA0926F4CcB43118b886CFD539239b7BeF75C15');
    expect(it0.crossRuntime?.direction).toBe('tezos-to-evm');
    expect(it0.crossRuntime?.evmEffectStatus).toBe('unresolved');
    expect(it0.crossRuntime?.l1OpHash).toBe('ooNL489SnERfEJD8gfDExhe8XPfXKqpmcMrqtsdZFvYYhQb84rH');
    expect(it0.crossRuntime?.tzktOperationId).toBe(103102283776);
  });

  it('parses a non-NAC contract call as contract-call kind', async () => {
    mockFetch([mixed[2]]);
    const page = await new TezosActivityFetcher().list({ holder: HOLDER, limit: 10 });
    const it0 = page.items[0];
    expect(it0.kind).toBe('contract-call');
    if (it0.kind !== 'contract-call') return;
    expect(it0.target).toBe('KT1AbCdEfGhIjKlMnOpQrStUvWxYz12345678');
    expect(it0.methodSig).toBe('approve');
    expect(it0.direction).toBe('sent');
  });

  it('emits a cursor only when the response is full (page-size sized)', async () => {
    mockFetch(mixed);
    const page = await new TezosActivityFetcher().list({ holder: HOLDER, limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.cursor).toBe('90000000000');                  // id of the last (oldest) item
  });

  it('omits the cursor when the response is short of the limit', async () => {
    mockFetch(mixed);
    const page = await new TezosActivityFetcher().list({ holder: HOLDER, limit: 25 });
    expect(page.cursor).toBeUndefined();
  });

  it('passes lastId on subsequent calls', async () => {
    const fetchSpy = vi.fn<(input: string) => Promise<Response>>(
      async () => new Response('[]', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await new TezosActivityFetcher().list({ holder: HOLDER, limit: 25, cursor: '12345' });
    expect(fetchSpy.mock.calls[0][0]).toContain('lastId=12345');
  });

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(new TezosActivityFetcher().list({ holder: HOLDER, limit: 25 })).rejects.toThrow(/TzKT HTTP 503/);
  });
});
