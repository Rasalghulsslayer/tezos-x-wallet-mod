/**
 * trackCrossRuntimeStatus: async iterable yielding CrossTxStatus updates for
 * a cross-runtime transaction. Polls the EVM RPC for receipt and emits the
 * stage transitions broadcasting → included-source → included-target →
 * finalized (or failed / unresolved-target on the failure paths).
 */

import type { CrossTxStatus } from '../domain/tx-status.js';
import type { CrossRuntimeDirection } from '../domain/cross-runtime.js';
import type { TransportPort } from '../ports/transport.js';
import { RelayerError } from '../domain/error.js';
import { sleep } from '../shared/async.js';
import { hexToNum } from '../shared/hex.js';

const POLL_INTERVAL_MS           = 2_000;
const MAX_POLL_ATTEMPTS          = 60;
const FINALIZATION_CONFIRMATIONS = 2;
const METHOD_NOT_SUPPORTED       = -32601;

interface EvmReceipt {
  blockNumber: string;
  status:      string;
}

export async function* trackCrossRuntimeStatus(
  txHash:    `0x${string}`,
  direction: CrossRuntimeDirection,
  transport: TransportPort,
): AsyncIterable<CrossTxStatus> {
  // The michelson-to-evm direction is already handled by
  // RelayerProvider.resolveSyntheticHash; this iterator only covers the
  // evm-to-michelson flow where the consumer already holds an EVM tx hash.
  if (direction !== 'evm-to-michelson') {
    throw new RelayerError(
      `trackCrossRuntimeStatus: direction '${direction}' is not supported by this entry point.`,
      METHOD_NOT_SUPPORTED,
    );
  }

  yield { stage: 'broadcasting' };

  let sourceBlock: number | null = null;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const receipt = await transport.evmRpc.call<EvmReceipt | null>(
      'eth_getTransactionReceipt', [txHash],
    );
    if (receipt != null) {
      sourceBlock = hexToNum(receipt.blockNumber);
      if (receipt.status === '0x0') {
        yield { stage: 'failed', reason: `EVM tx reverted at block ${sourceBlock}` };
        return;
      }
      yield { stage: 'included-source', sourceBlock };
      // The NAC precompile is invoked synchronously during EVM execution,
      // so source inclusion implies the Michelson target effect has applied.
      yield { stage: 'included-target', sourceBlock, targetBlock: sourceBlock };
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (sourceBlock === null) {
    yield { stage: 'failed', reason: 'EVM tx not included within timeout' };
    return;
  }

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const head     = hexToNum(await transport.evmRpc.call<string>('eth_blockNumber'));
    const confirms = head - sourceBlock;
    if (confirms >= FINALIZATION_CONFIRMATIONS) {
      yield {
        stage:         'finalized',
        sourceBlock,
        targetBlock:   sourceBlock,
        confirmations: confirms,
      };
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  yield { stage: 'unresolved-target', sourceBlock };
}
