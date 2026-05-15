/**
 * Encoders for the NAC precompile entrypoints: transfer(string) and
 * callMichelson(string,string,bytes). Each returns a 0x-prefixed calldata
 * hex ready for an EVM transaction's data field.
 */

import { encodeFunctionData, type Hex } from 'viem';

const NAC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [{ name: 'destination', type: 'string' }],
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

export function encodeNacTransfer(destination: string): Hex {
  return encodeFunctionData({
    abi:          NAC_ABI,
    functionName: 'transfer',
    args:         [destination],
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
