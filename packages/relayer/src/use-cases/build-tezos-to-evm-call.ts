/**
 * buildTezosToEvmCall: builds a NAC gateway Michelson call (GatewayCall)
 * from an EthTransactionRequest. Resolves the 4-byte selector via a local
 * registry then via 4byte.directory as fallback.
 */

import type { MichelsonV1Expression } from '@taquito/rpc';
import { NAC_CONTRACT } from '../shared/constants.js';
import type { GatewayCall } from '../domain/cross-runtime.js';
import type { EthTransactionRequest } from '../domain/eth-tx.js';

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function isEmptyCalldata(calldata: string): boolean {
  return stripHexPrefix(calldata).length === 0;
}

const KNOWN_SIGNATURES: Record<string, string> = {
  'a1544fc3': 'callMichelson(string,string,bytes)',
  'a9059cbb': 'transfer(address,uint256)',
  '095ea7b3': 'approve(address,uint256)',
  '23b872dd': 'transferFrom(address,address,uint256)',
  '70a08231': 'balanceOf(address)',
  'dd62ed3e': 'allowance(address,address)',
  '18160ddd': 'totalSupply()',
  '313ce567': 'decimals()',
  'b6b55f25': 'deposit(uint256)',
  '2e1a7d4d': 'withdraw(uint256)',
  'd0e30db0': 'deposit()',
  '3ccfd60b': 'withdraw()',
  '4e71d92d': 'claim()',
  '2e17de78': 'unstake(uint256)',
};

async function lookupMethodSignature(selectorHex: string): Promise<string | null> {
  try {
    const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=0x${selectorHex}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { text_signature: string }[] };
    const results = json.results;
    if (!results || results.length === 0) return null;
    return results[0].text_signature;
  } catch {
    return null;
  }
}

async function resolveMethodSignature(selectorHex: string): Promise<string> {
  const known = KNOWN_SIGNATURES[selectorHex];
  if (known) return known;

  const remote = await lookupMethodSignature(selectorHex);
  if (remote) return remote;

  console.warn(`[TezosX Relayer] Unknown selector 0x${selectorHex} — using raw hex`);
  return selectorHex;
}

function buildDefaultArg(destination: string): MichelsonV1Expression {
  return { string: destination };
}

function buildCallArg(
  destination:  string,
  methodSig:    string,
  abiParamsHex: string,
  callback:     MichelsonV1Expression = { prim: 'None' },
): MichelsonV1Expression {
  return {
    prim: 'Pair',
    args: [
      { string: destination },
      {
        prim: 'Pair',
        args: [
          { string: methodSig },
          {
            prim: 'Pair',
            args: [
              { bytes: abiParamsHex },
              callback,
            ],
          },
        ],
      },
    ],
  };
}

export async function buildTezosToEvmCall(
  tx: EthTransactionRequest,
  callback: MichelsonV1Expression = { prim: 'None' },
): Promise<GatewayCall> {
  const calldata = tx.data ?? '0x';

  const weiValue    = tx.value != null ? BigInt(tx.value) : 0n;
  const mutezAmount = weiValue > 0n ? weiValue / 1_000_000_000_000n : 0n;

  if (isEmptyCalldata(calldata)) {
    return {
      direction:    'michelson-to-evm',
      contractAddr: NAC_CONTRACT,
      entrypoint:   'default',
      michelineArg: buildDefaultArg(tx.to),
      mutezAmount,
    };
  }

  const calldataHex  = stripHexPrefix(calldata);
  const selectorHex  = calldataHex.slice(0, 8);
  const abiParamsHex = calldataHex.slice(8);

  const methodSig = await resolveMethodSignature(selectorHex);
  console.info('[TezosX Relayer] gateway selector →', `0x${selectorHex}`, '→', methodSig);

  return {
    direction:    'michelson-to-evm',
    contractAddr: NAC_CONTRACT,
    entrypoint:   'call_evm',
    michelineArg: buildCallArg(tx.to, methodSig, abiParamsHex, callback),
    mutezAmount,
  };
}
