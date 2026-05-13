/**
 * EIP-1559 transaction signing (type 0x02). Returns a 0x-prefixed raw
 * transaction ready to broadcast via eth_sendRawTransaction.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256 } from './keccak';
import { rlpEncode, type RlpInput } from './rlp';
import { bigIntToBytes, bytesToHex, concatBytes, hexToBytes } from './bytes';

export interface EvmTx1559 {
  chainId:              bigint;
  nonce:                bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas:         bigint;
  gasLimit:             bigint;
  to:                   `0x${string}`;
  value:                bigint;
  data:                 `0x${string}`;
  accessList?:          Array<{ address: `0x${string}`; storageKeys: `0x${string}`[] }>;
}

export function signTransaction1559(tx: EvmTx1559, privateKeyHex: string): `0x${string}` {
  const accessList = tx.accessList ?? [];
  const accessListRlp: RlpInput = accessList.map((item) => [
    hexToBytes(item.address),
    item.storageKeys.map((k) => hexToBytes(k)),
  ]);

  const unsignedFields: RlpInput = [
    bigIntToBytes(tx.chainId),
    bigIntToBytes(tx.nonce),
    bigIntToBytes(tx.maxPriorityFeePerGas),
    bigIntToBytes(tx.maxFeePerGas),
    bigIntToBytes(tx.gasLimit),
    hexToBytes(tx.to),
    bigIntToBytes(tx.value),
    hexToBytes(tx.data),
    accessListRlp,
  ];

  const unsignedRlp = rlpEncode(unsignedFields);
  const unsigned    = concatBytes(new Uint8Array([0x02]), unsignedRlp);
  const sigHash     = hexToBytes(keccak256(unsigned));

  const privBytes = hexToBytes(privateKeyHex);
  const sig       = secp256k1.sign(sigHash, privBytes, { lowS: true });
  const yParity   = sig.recovery;

  // EIP-1559 uses yParity (0 or 1) directly, not the legacy v = 27 + recovery.
  const signedFields: RlpInput = [
    ...unsignedFields,
    bigIntToBytes(BigInt(yParity)),
    bigIntToBytes(sig.r),
    bigIntToBytes(sig.s),
  ];

  const signedRlp = rlpEncode(signedFields);
  const signed    = concatBytes(new Uint8Array([0x02]), signedRlp);
  return `0x${bytesToHex(signed)}` as `0x${string}`;
}
