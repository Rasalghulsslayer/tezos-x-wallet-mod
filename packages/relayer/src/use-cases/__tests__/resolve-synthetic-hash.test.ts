import { describe, it, expect } from 'vitest';
import { findRealHash } from '../resolve-synthetic-hash';
import { NAC_PRECOMPILE_ADDR } from '../../shared/constants';
import type { TezlinkClient, EvmBlock, EvmTxSummary } from '../../tezos/tezlink';
import type { EthTransactionReceipt } from '../../domain/eth-tx';

const ALIAS = '0xb650b9991e6e7f693d72cd66c6aceeaf254ef606';
const OTHER = '0x1111111111111111111111111111111111111111';
const DEST  = '0xdEAD000000000000000042000000000000000000';

const h = (label: string): string => '0x' + label.padEnd(64, '0');

function tx(hash: string, f: Partial<EvmTxSummary>): EvmTxSummary {
  return {
    hash,
    from:        f.from ?? OTHER,
    to:          f.to ?? null,
    blockNumber: '0x10',
    nonce:       f.nonce,
    value:       f.value,
  };
}

function receiptWithLogAddress(address: string): EthTransactionReceipt {
  return { logs: [{ address }] } as unknown as EthTransactionReceipt;
}

// Minimal fake exposing only the three methods findRealHash calls.
class FakeTezlink {
  constructor(
    private head:     number,
    private blocks:   Record<number, EvmBlock | null>,
    private receipts: Record<string, EthTransactionReceipt | null> = {},
  ) {}
  async blockNumber(): Promise<string> { return '0x' + this.head.toString(16); }
  async getBlockByNumber(blockNumber: string): Promise<EvmBlock | null> {
    return this.blocks[parseInt(blockNumber, 16)] ?? null;
  }
  async getTransactionReceipt(hash: string): Promise<EthTransactionReceipt | null> {
    return this.receipts[hash] ?? null;
  }
}

const asClient = (f: FakeTezlink): TezlinkClient => f as unknown as TezlinkClient;
const target = { to: DEST, value: '0x0', senderAlias: ALIAS };

describe('findRealHash — synthetic→real hash resolution', () => {
  it('matches a sender-side synthesized tx (from = alias) and claims it', async () => {
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [tx(h('aa'), { from: ALIAS, nonce: '0x0' })] },
    });
    const claimed = new Set<string>();
    const hash = await findRealHash(asClient(fake), target, '0x10', claimed, 1, 0);
    expect(hash).toBe(h('aa'));
    expect(claimed.has(h('aa'))).toBe(true);
  });

  it('two concurrent ops on the same alias claim distinct txs in nonce order (audit M3)', async () => {
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [
        tx(h('b1'), { from: ALIAS, nonce: '0x1' }),
        tx(h('b0'), { from: ALIAS, nonce: '0x0' }),
      ] },
    });
    const claimed = new Set<string>();
    const first  = await findRealHash(asClient(fake), target, '0x10', claimed, 1, 0);
    const second = await findRealHash(asClient(fake), target, '0x10', claimed, 1, 0);
    expect(first).toBe(h('b0'));   // lowest nonce claimed first (from-only fallback)
    expect(second).toBe(h('b1'));  // shared claimed set → next unclaimed tx
    expect(first).not.toBe(second);
  });

  it('prefers the exact to/value match over nonce order, so concurrent ops never swap receipts (#74)', async () => {
    const DEST_A = '0x' + 'aa'.repeat(20);
    const DEST_B = '0x' + 'bb'.repeat(20);
    const VAL_A  = '0x38d7ea4c68000';   // 0.001
    const VAL_B  = '0x16345785d8a0000'; // 0.1
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [
        tx(h('txB'), { from: ALIAS, to: DEST_B, value: VAL_B, nonce: '0x0' }), // lower nonce
        tx(h('txA'), { from: ALIAS, to: DEST_A, value: VAL_A, nonce: '0x1' }),
      ] },
    });
    const claimed = new Set<string>();
    // Op A wants DEST_A/VAL_A: it must claim txA even though txB has the lower
    // nonce — under the old from-only match it would have grabbed txB (the swap).
    const a = await findRealHash(asClient(fake), { to: DEST_A, value: VAL_A, senderAlias: ALIAS }, '0x10', claimed, 1, 0);
    expect(a).toBe(h('txA'));
    // Op B then claims its own exact match.
    const b = await findRealHash(asClient(fake), { to: DEST_B, value: VAL_B, senderAlias: ALIAS }, '0x10', claimed, 1, 0);
    expect(b).toBe(h('txB'));
  });

  it('claims an inbound bookkeeping tx (to = alias) only when its receipt carries a NAC precompile log', async () => {
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [
        tx(h('c0'), { to: ALIAS, nonce: '0x0' }),  // no NAC log → skipped
        tx(h('c1'), { to: ALIAS, nonce: '0x1' }),  // NAC log → claimed
      ] },
    }, {
      [h('c0')]: receiptWithLogAddress(OTHER),
      [h('c1')]: receiptWithLogAddress(NAC_PRECOMPILE_ADDR),
    });
    const hash = await findRealHash(asClient(fake), target, '0x10', new Set(), 1, 0);
    expect(hash).toBe(h('c1'));
  });

  it('does not claim an inbound tx whose receipt lacks a NAC precompile log', async () => {
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [tx(h('d0'), { to: ALIAS, nonce: '0x0' })] },
    }, { [h('d0')]: receiptWithLogAddress(OTHER) });
    const hash = await findRealHash(asClient(fake), target, '0x10', new Set(), 1, 0);
    expect(hash).toBeNull();
  });

  it('returns null when no tx is bound to the alias', async () => {
    const fake = new FakeTezlink(0x10, {
      0x10: { number: '0x10', transactions: [tx(h('e0'), { from: OTHER, to: OTHER })] },
    });
    const hash = await findRealHash(asClient(fake), target, '0x10', new Set(), 2, 0);
    expect(hash).toBeNull();
  });
});
