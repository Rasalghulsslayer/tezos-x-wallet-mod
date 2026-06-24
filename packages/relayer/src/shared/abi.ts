/**
 * Encoders for the NAC precompile entrypoints: the generic `call(...)` HTTP
 * entrypoint and callMichelson(string,string,bytes). Each returns a
 * 0x-prefixed calldata hex ready for an EVM transaction's data field.
 */

import { encodeFunctionData, type Hex } from 'viem';

const NAC_ABI = [
  {
    type: 'function',
    name: 'call',
    inputs: [
      { name: 'url',     type: 'string' },
      { name: 'headers', type: 'tuple[]', components: [
        { name: 'key',   type: 'string' },
        { name: 'value', type: 'string' },
      ] },
      { name: 'body',    type: 'bytes' },
      { name: 'method',  type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'callMichelson',
    inputs: [
      { name: 'destination', type: 'string' },
      { name: 'entrypoint',  type: 'string' },
      { name: 'data',        type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

export interface NacHttpHeader { key: string; value: string }

/**
 * Encode a generic NAC `call` (the survivor of the removed `transfer`): an
 * HTTP-style request the precompile forwards to the Michelson runtime. A bare
 * native transfer is a POST to `http://tezos/<tz1>` with no headers and an
 * empty body; the EVM `msg.value` is credited to the destination (converted
 * wei→mutez by the kernel — the EL-02 inflation was fixed in tezos/tezos!21278).
 */
export function encodeNacCall(
  url:     string,
  headers: NacHttpHeader[],
  body:    string,
  method:  number,
): Hex {
  const bodyHex = (body.startsWith('0x') ? body : `0x${body}`) as Hex;
  return encodeFunctionData({
    abi:          NAC_ABI,
    functionName: 'call',
    args:         [url, headers, bodyHex, method],
  });
}

export function encodeNacCallMichelson(
  destination:     string,
  entrypoint:      string,
  binaryMicheline: string,
): Hex {
  // binaryMicheline is expected to be the output of `octez-client convert data
  // from michelson to binary` (no 0x05 PACK prefix). The leading 0x is added
  // if not already present.
  const dataHex = (binaryMicheline.startsWith('0x') ? binaryMicheline : `0x${binaryMicheline}`) as Hex;
  return encodeFunctionData({
    abi:          NAC_ABI,
    functionName: 'callMichelson',
    args:         [destination, entrypoint, dataHex],
  });
}
