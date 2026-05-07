import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import {
  TZKT_API_BASE,
  FINALIZED_AFTER_BLOCKS,
  TX_POLL_INTERVAL_FAST_MS,
  TX_POLL_INTERVAL_SLOW_MS,
  TX_POLL_TIMEOUT_MS,
} from './constants';
import { startPoller, type PollHandle } from './poller';

export type TxStatus =
  | { stage: 'broadcasting' }
  | { stage: 'included';   blockLevel: number; timestampMs: number }
  | { stage: 'finalized';  blockLevel: number; confirmations: number }
  | { stage: 'failed';     reason: string }
  | { stage: 'unavailable' };

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

  if (confirmations >= FINALIZED_AFTER_BLOCKS) {
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

async function pollL2(realHash: string): Promise<TxStatus | null> {
  const receipt = await rpcCall<EvmReceipt | null>(
    'eth_getTransactionReceipt', [realHash],
  );
  if (receipt === null) return null;

  const blockLevel = parseInt(receipt.blockNumber, 16);
  if (receipt.status !== '0x1') {
    return { stage: 'failed', reason: 'Reverted' };
  }

  const headHex = await rpcCall<string>('eth_blockNumber', []);
  const head = parseInt(headHex, 16);
  const confirmations = head - blockLevel;

  if (confirmations >= FINALIZED_AFTER_BLOCKS) {
    return { stage: 'finalized', blockLevel, confirmations };
  }
  return { stage: 'included', blockLevel, timestampMs: Date.now() };
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
