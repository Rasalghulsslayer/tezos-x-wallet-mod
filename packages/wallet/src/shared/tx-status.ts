import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import {
  TZKT_API_BASE,
  TEZOS_L1_FINALITY_BLOCKS,
  TX_POLL_INTERVAL_FAST_MS,
  TX_POLL_INTERVAL_SLOW_MS,
  TX_POLL_TIMEOUT_MS,
} from './constants';
import { startPoller, type PollHandle } from './poller';
import type { TxStatus } from '../domain/tx-status';

export interface TrackTxArgs {
  hash:     string;
  runtime:  'l1' | 'l2';
  onUpdate: (status: TxStatus) => void;
}

/**
 * Track the lifecycle of a transaction (L1 native or L2 cross-runtime)
 * and stream status updates until finalization or timeout. Returns a
 * handle to cancel the tracking on unmount.
 */
export function trackTx({ hash, runtime, onUpdate }: TrackTxArgs): PollHandle {
  onUpdate({ stage: 'broadcasting' });

  const poller = startPoller<TxStatus>({
    fetch:    () => (runtime === 'l1' ? pollL1(hash) : pollL2(hash)),
    onUpdate: (status) => {
      onUpdate(status);
      if (status.stage === 'included') {
        poller.slowDown(TX_POLL_INTERVAL_SLOW_MS);
      }
    },
    isDone:    (s) => s.stage === 'finalized' || s.stage === 'failed',
    intervalMs: TX_POLL_INTERVAL_FAST_MS,
    timeoutMs:  TX_POLL_TIMEOUT_MS,
    onTimeout:  () => onUpdate({ stage: 'unavailable' }),
  });

  return { stop: () => poller.stop() };
}

// ── L1 polling via TzKT ─────────────────────────────────────────────────

interface TzktOperation {
  level:     number;
  timestamp: string;
  status:    string;
}

async function pollL1(opHash: string): Promise<TxStatus | null> {
  const opRes = await fetch(
    `${TZKT_API_BASE}/v1/operations/transactions?hash=${opHash}`,
  );
  if (!opRes.ok) return null;
  const ops = (await opRes.json()) as TzktOperation[];
  if (ops.length === 0) return null;

  const op = ops[0];
  if (op.status !== 'applied') {
    return { stage: 'failed', reason: op.status };
  }

  const headRes = await fetch(`${TZKT_API_BASE}/v1/head`);
  const head = (await headRes.json()) as { level: number };
  const confirmations = head.level - op.level;

  // Tenderbake-style finality: a Tezos L1 block is final after 2 attestation
  // rounds. head.level - op.level >= TEZOS_L1_FINALITY_BLOCKS is the canonical
  // check. For L2 EVM blocks we use the `finalized` block tag instead — see
  // pollL2.
  if (confirmations >= TEZOS_L1_FINALITY_BLOCKS) {
    return { stage: 'finalized', blockLevel: op.level, confirmations };
  }
  return {
    stage:       'included',
    blockLevel:  op.level,
    timestampMs: new Date(op.timestamp).getTime(),
  };
}

// ── L2 polling via Tezlink EVM RPC ──────────────────────────────────────

interface EvmReceipt { blockNumber: string; status: string }
interface EvmBlockHeader { number: string }

async function pollL2(realHash: string): Promise<TxStatus | null> {
  const receipt = await rpcCall<EvmReceipt | null>(
    'eth_getTransactionReceipt', [realHash],
  );
  if (receipt === null) return null;

  const blockLevel = parseInt(receipt.blockNumber, 16);
  if (receipt.status !== '0x1') {
    return { stage: 'failed', reason: 'Reverted' };
  }

  // L2 finality on Tezos X is driven by L1 inclusion: a Tezlink block
  // becomes final when its L1 parent reaches finality. The `finalized`
  // block tag exposes that signal directly.
  const finalizedBlock = await rpcCall<EvmBlockHeader | null>(
    'eth_getBlockByNumber', ['finalized', false],
  );
  const finalizedBlockLevel = finalizedBlock != null
    ? parseInt(finalizedBlock.number, 16)
    : -1;

  if (finalizedBlockLevel >= blockLevel) {
    return { stage: 'finalized', blockLevel, finalizedBlockLevel };
  }
  return {
    stage:       'included',
    blockLevel,
    timestampMs: Date.now(),
  };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(TEZLINK_EVM_RPC, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error != null) throw new Error(json.error.message);
  return json.result as T;
}
