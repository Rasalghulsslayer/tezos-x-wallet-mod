/**
 * l1OpHashToEvmHash: keccak256 of a Michelson opHash, returned as a 32-byte
 * EVM-style hex hash.
 * buildSyntheticReceipt: fallback EthTransactionReceipt for cross-runtime
 * transactions whose real EVM hash cannot be resolved.
 */

import { keccak } from '../shared/keccak.js';
import type { EthTransactionReceipt } from '../types.js';

export function l1OpHashToEvmHash(l1OpHash: string): string {
  return keccak(l1OpHash);
}

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
