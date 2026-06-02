/**
 * Tests for the L2 finality model in pollL2: a Tezlink block is final when
 * its number is <= the `finalized` block tag's number. This replaces the
 * head - tx >= N heuristic that was incorrect for Tezos X (per Thomas
 * Letan's feedback on 2026-05-15, #techrel-tezosx-mvp).
 *
 * The L1 (TzKT) path keeps the Tenderbake 2-attestation logic — see the
 * companion cases at the bottom of this file.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackTx } from '../tx-status';
import type { TxStatus } from '../../domain/tx-status';

const TX_HASH    = '0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd';
const TX_OP_HASH = 'op9TestL1OperationHashBase58_______________________';
const TX_BLOCK   = 100;

interface RpcMock {
  receipt?:        { blockNumber: string; status: string } | null;
  finalizedBlock?: { number: string } | null;
}

function hex(n: number): string { return '0x' + n.toString(16); }

function stubEvmRpc(mock: RpcMock) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse((init?.body as string) ?? '{}') as { method: string };
    if (body.method === 'eth_getTransactionReceipt') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: mock.receipt }), { status: 200 });
    }
    if (body.method === 'eth_getBlockByNumber') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: mock.finalizedBlock }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'unknown method' } }), { status: 200 });
  });
}

function stubTzktL1(op: { level: number; timestamp: string; status: string } | null, headLevel: number) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/v1/operations/transactions')) {
      return new Response(JSON.stringify(op == null ? [] : [op]), { status: 200 });
    }
    if (u.includes('/v1/head')) {
      return new Response(JSON.stringify({ level: headLevel }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

/**
 * Drive the poller through a few ticks and return the latest TxStatus emitted.
 * `trackTx` fires onUpdate immediately with 'broadcasting' and then once per
 * poll tick. We wait ~120ms (the first interval is 2s, but the very first
 * tick fires after one interval — for this test we set a short interval via
 * the poller's internal cadence). For the model-level checks below we don't
 * actually need the poller — we just call the L1/L2 fetchers via trackTx
 * and read what they produce. To keep this fast and deterministic, we use
 * vi.useFakeTimers and advance the clock.
 */
async function captureFirstNonBroadcasting(runtime: 'l1' | 'l2', hash: string): Promise<TxStatus> {
  return new Promise<TxStatus>((resolve) => {
    let resolved = false;
    const handle = trackTx({
      hash,
      runtime,
      onUpdate: (status) => {
        if (status.stage === 'broadcasting') return;
        if (resolved) return;
        resolved = true;
        handle.stop();
        resolve(status);
      },
    });
    // Safety: if no non-broadcasting status arrives within 6s, fail.
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        handle.stop();
        resolve({ stage: 'unavailable' });
      }
    }, 6_000);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('pollL2 — L2 finality via `finalized` block tag', () => {
  it('tx included at block N, finalized = N − 1 → stage: included', async () => {
    stubEvmRpc({
      receipt:        { blockNumber: hex(TX_BLOCK), status: '0x1' },
      finalizedBlock: { number: hex(TX_BLOCK - 1) },
    });
    const status = await captureFirstNonBroadcasting('l2', TX_HASH);
    expect(status.stage).toBe('included');
    if (status.stage === 'included') expect(status.blockLevel).toBe(TX_BLOCK);
  }, 10_000);

  it('tx included at block N, finalized = N → stage: finalized', async () => {
    stubEvmRpc({
      receipt:        { blockNumber: hex(TX_BLOCK), status: '0x1' },
      finalizedBlock: { number: hex(TX_BLOCK) },
    });
    const status = await captureFirstNonBroadcasting('l2', TX_HASH);
    expect(status.stage).toBe('finalized');
    if (status.stage === 'finalized') {
      expect(status.blockLevel).toBe(TX_BLOCK);
      expect(status.finalizedBlockLevel).toBe(TX_BLOCK);
    }
  }, 10_000);

  it('tx included at block N, finalized = N + 5 → stage: finalized (no over-counting)', async () => {
    stubEvmRpc({
      receipt:        { blockNumber: hex(TX_BLOCK), status: '0x1' },
      finalizedBlock: { number: hex(TX_BLOCK + 5) },
    });
    const status = await captureFirstNonBroadcasting('l2', TX_HASH);
    expect(status.stage).toBe('finalized');
    if (status.stage === 'finalized') {
      expect(status.blockLevel).toBe(TX_BLOCK);
      expect(status.finalizedBlockLevel).toBe(TX_BLOCK + 5);
    }
  }, 10_000);

  it('receipt with status 0x0 → stage: failed (Reverted), regardless of finality', async () => {
    stubEvmRpc({
      receipt:        { blockNumber: hex(TX_BLOCK), status: '0x0' },
      finalizedBlock: { number: hex(TX_BLOCK + 10) },
    });
    const status = await captureFirstNonBroadcasting('l2', TX_HASH);
    expect(status.stage).toBe('failed');
    if (status.stage === 'failed') expect(status.reason).toBe('Reverted');
  }, 10_000);
});

describe('pollL1 — L1 Tenderbake finality (unchanged)', () => {
  it('op applied, head − op.level < 2 → stage: included', async () => {
    stubTzktL1(
      { level: 1_000, timestamp: '2026-05-15T10:00:00Z', status: 'applied' },
      1_000, // head == op.level → confirmations = 0
    );
    const status = await captureFirstNonBroadcasting('l1', TX_OP_HASH);
    expect(status.stage).toBe('included');
  }, 10_000);

  it('op applied, head − op.level >= 2 → stage: finalized with confirmations', async () => {
    stubTzktL1(
      { level: 1_000, timestamp: '2026-05-15T10:00:00Z', status: 'applied' },
      1_002,
    );
    const status = await captureFirstNonBroadcasting('l1', TX_OP_HASH);
    expect(status.stage).toBe('finalized');
    if (status.stage === 'finalized') {
      expect(status.blockLevel).toBe(1_000);
      expect(status.confirmations).toBe(2);
    }
  }, 10_000);

  it('op status != applied → stage: failed with op status as reason', async () => {
    stubTzktL1(
      { level: 1_000, timestamp: '2026-05-15T10:00:00Z', status: 'backtracked' },
      1_002,
    );
    const status = await captureFirstNonBroadcasting('l1', TX_OP_HASH);
    expect(status.stage).toBe('failed');
    if (status.stage === 'failed') expect(status.reason).toBe('backtracked');
  }, 10_000);
});
