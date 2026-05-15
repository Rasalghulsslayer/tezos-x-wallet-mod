/**
 * EIP-1559 transaction signing (type 0x02). Returns a 0x-prefixed raw
 * transaction ready to broadcast via eth_sendRawTransaction.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
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

  // @noble/curves v2: sign() with `format: 'recovered'` returns a 65-byte
  // Uint8Array laid out as [recovery, r(32), s(32)]. The .d.ts overload types
  // it as Uint8Array regardless of format; we parse the bytes explicitly.
  const sigBytes = secp256k1.sign(sigHash, privBytes, { lowS: true, prehash: false, format: 'recovered' });
  const yParity  = sigBytes[0];
  const r        = BigInt(`0x${bytesToHex(sigBytes.subarray(1, 33))}`);
  const s        = BigInt(`0x${bytesToHex(sigBytes.subarray(33, 65))}`);

  // EIP-1559 uses yParity (0 or 1) directly, not the legacy v = 27 + recovery.
  const signedFields: RlpInput = [
    ...unsignedFields,
    bigIntToBytes(BigInt(yParity)),
    bigIntToBytes(r),
    bigIntToBytes(s),
  ];

  const signedRlp = rlpEncode(signedFields);
  const signed    = concatBytes(new Uint8Array([0x02]), signedRlp);
  return `0x${bytesToHex(signed)}` as `0x${string}`;
}
