import { keccak256, toBytes } from 'viem';
import type { EthTransactionReceipt } from '../types.js';

/** Derive a stable 32-byte EVM-style hash from a Michelson runtime opHash. */
export function l1OpHashToEvmHash(l1OpHash: string): string {
  return keccak256(toBytes(l1OpHash));
}

/** Fallback receipt returned when no real EVM receipt can be resolved. */
export function buildSyntheticReceipt(
  syntheticHash: string,
  from: string,
  to: string,
): EthTransactionReceipt {
  return {
    transactionHash:   syntheticHash,
    transactionIndex:  '0x0',
    blockHash:         syntheticHash,
    blockNumber:       '0x1',
    from,
    to,
    contractAddress:   null,
    cumulativeGasUsed: '0x5208',
    gasUsed:           '0x5208',
    effectiveGasPrice: '0x0',
    logs:              [],
    logsBloom:         '0x' + '0'.repeat(512),
    status:            '0x1',
    type:              '0x2',
  };
}
