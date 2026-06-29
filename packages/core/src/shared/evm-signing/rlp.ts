/**
 * RLP (Recursive Length Prefix) encoder for Ethereum. Accepts Uint8Array
 * leaves and nested arrays.
 */

import { concatBytes } from './bytes';

export type RlpInput = Uint8Array | RlpInput[];

export function rlpEncode(input: RlpInput): Uint8Array {
  if (input instanceof Uint8Array) return encodeBytes(input);
  return encodeList(input);
}

function encodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
  if (bytes.length < 56) {
    return concatBytes(new Uint8Array([0x80 + bytes.length]), bytes);
  }
  const lenBytes = lenToBytes(bytes.length);
  return concatBytes(new Uint8Array([0xb7 + lenBytes.length]), lenBytes, bytes);
}

function encodeList(items: RlpInput[]): Uint8Array {
  const encoded = items.map(rlpEncode);
  const payload = concatBytes(...encoded);
  if (payload.length < 56) {
    return concatBytes(new Uint8Array([0xc0 + payload.length]), payload);
  }
  const lenBytes = lenToBytes(payload.length);
  return concatBytes(new Uint8Array([0xf7 + lenBytes.length]), lenBytes, payload);
}

function lenToBytes(len: number): Uint8Array {
  const bytes: number[] = [];
  while (len > 0) {
    bytes.unshift(len & 0xff);
    len >>= 8;
  }
  return new Uint8Array(bytes);
}
