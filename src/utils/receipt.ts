import { keccak256, toBytes } from 'viem';
import type { EthTransactionReceipt } from '../types.js';
import type { TezlinkClient } from '../tezlink.js';

/**
 * Derive a stable, deterministic 32-byte EVM-style transaction hash from a
 * Tezos L1 operation hash (Base58Check string).
 *
 * Strategy: keccak256 of the UTF-8 bytes of the opHash string.
 * This gives a consistent 0x-prefixed 32-byte hex that can be used as the
 * "transaction hash" returned to dApps after eth_sendTransaction.
 * The mapping is stored in RelayerProvider.pendingOps for receipt resolution.
 */
export function l1OpHashToEvmHash(l1OpHash: string): string {
  return keccak256(toBytes(l1OpHash));
}

/**
 * Build a synthetic EVM transaction receipt from a Tezos L1 operation hash.
 * Used as a fallback when Tezlink does not index the operation.
 *
 * The receipt has status '0x1' (assumed success since the op was injected
 * without error). dApps that check logs will receive an empty array.
 */
export function buildSyntheticReceipt(
  syntheticHash: string,
  from: string,
  to: string,
): EthTransactionReceipt {
  return {
    transactionHash:   syntheticHash,
    blockHash:         syntheticHash,
    blockNumber:       '0x1',
    from,
    to,
    contractAddress:   null,
    cumulativeGasUsed: '0x0',
    gasUsed:           '0x0',
    logs:              [],
    logsBloom:         '0x' + '0'.repeat(512),
    status:            '0x1',
    type:              '0x0',
  };
}

/**
 * Poll Tezlink for a transaction receipt until non-null or timeout.
 * Returns null if the receipt is not found within maxAttempts.
 */
export async function pollForReceipt(
  tezlinkClient: TezlinkClient,
  txHash: string,
  maxAttempts = 20,
  intervalMs = 3000,
): Promise<EthTransactionReceipt | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const receipt = await tezlinkClient.getTransactionReceipt(txHash);
    if (receipt !== null) return receipt;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  return null;
}
