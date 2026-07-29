/**
 * buildTezosToEvmCall: builds a NAC gateway Michelson call (GatewayCall)
 * from an EthTransactionRequest. The 4-byte selector is resolved against
 * a curated local allow-list; adding a new selector is a code change.
 */

import type { MichelsonV1Expression } from '@taquito/rpc';
import { NAC_CONTRACT, NAC_ETHEREUM_RUNTIME_URL, NAC_HTTP_POST } from '../shared/constants.js';
import type { GatewayCall } from '../domain/cross-runtime.js';
import type { EthTransactionRequest } from '../domain/eth-tx.js';

function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

function isEmptyCalldata(calldata: string): boolean {
  return stripHexPrefix(calldata).length === 0;
}

/**
 * The text_signature here is embedded verbatim in the signed Micheline
 * payload — every entry needs to be reviewed before being added.
 */
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
  'd09de08a': 'increment()',
  '2baeceb7': 'decrement()',
  '3fb5c1cb': 'setNumber(uint256)',
};

export class UnknownSelectorError extends Error {
  constructor(public readonly selectorHex: string) {
    super(
      `Unknown function selector 0x${selectorHex}. The relayer only signs ` +
      `cross-runtime calls for a curated allow-list of methods.`,
    );
    this.name = 'UnknownSelectorError';
  }
}

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * The destination is embedded verbatim in the signed Micheline (as the
 * `http://ethereum/<to>` url or the `call_evm` destination string). Reject
 * anything that is not a canonical 0x address before signing, so a dApp can't
 * slip an arbitrary string (path segments, spaces) past the truncated
 * approval display into what the user actually signs.
 */
export class InvalidDestinationError extends Error {
  constructor(public readonly to: string) {
    super(`Invalid EVM destination address: ${to}`);
    this.name = 'InvalidDestinationError';
  }
}

/**
 * The Tezos runtime denominates value in mutez (10⁻⁶ XTZ). Wei amounts that
 * carry sub-mutez precision (remainder under 10¹² wei) would be silently
 * truncated by a floor division — reject them at build time so the loss
 * can't be hidden from the user.
 */
export class SubMutezPrecisionError extends Error {
  constructor(public readonly weiValue: bigint, public readonly remainderWei: bigint) {
    super(
      `Amount ${weiValue.toString()} wei is not divisible by 10^12 (1 mutez); ` +
      `remainder ${remainderWei.toString()} wei would be lost on the Tezos runtime.`,
    );
    this.name = 'SubMutezPrecisionError';
  }
}

const WEI_PER_MUTEZ = 1_000_000_000_000n;

/**
 * Convert wei to mutez, rejecting any sub-mutez remainder instead of flooring
 * it away. Exported so the wallet's native transfer paths (tz1→tz1, EVM→tz1)
 * enforce the same no-silent-loss rule as this gateway boundary.
 */
export function weiToMutezExact(wei: bigint): bigint {
  if (wei === 0n) return 0n;
  const remainder = wei % WEI_PER_MUTEZ;
  if (remainder !== 0n) throw new SubMutezPrecisionError(wei, remainder);
  return wei / WEI_PER_MUTEZ;
}

function resolveMethodSignature(selectorHex: string): string {
  const known = KNOWN_SIGNATURES[selectorHex];
  if (known) return known;
  throw new UnknownSelectorError(selectorHex);
}

/**
 * The generic `%call` entrypoint (the removed `%default` helper's replacement —
 * tezos/tezos!22168) takes an HTTP-style request:
 *   pair url (pair headers (pair body (pair method callback)))
 * A bare native transfer is a POST to http://ethereum/<0x> with empty headers
 * and body; the operation's mutez amount is credited to the destination.
 */
function buildHttpCallArg(url: string): MichelsonV1Expression {
  return {
    prim: 'Pair',
    args: [
      { string: url },
      {
        prim: 'Pair',
        args: [
          [], // headers: empty list (list (pair string string))
          {
            prim: 'Pair',
            args: [
              { bytes: '' }, // body: empty
              {
                prim: 'Pair',
                args: [
                  { int: String(NAC_HTTP_POST) }, // method: POST
                  { prim: 'None' },               // callback
                ],
              },
            ],
          },
        ],
      },
    ],
  };
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
  if (!EVM_ADDR_RE.test(tx.to)) throw new InvalidDestinationError(tx.to);
  const calldata = tx.data ?? '0x';

  const weiValue    = tx.value != null ? BigInt(tx.value) : 0n;
  const mutezAmount = weiToMutezExact(weiValue);

  if (isEmptyCalldata(calldata)) {
    return {
      direction:    'michelson-to-evm',
      contractAddr: NAC_CONTRACT,
      entrypoint:   'call',
      michelineArg: buildHttpCallArg(`${NAC_ETHEREUM_RUNTIME_URL}${tx.to}`),
      mutezAmount,
    };
  }

  const calldataHex  = stripHexPrefix(calldata);
  const selectorHex  = calldataHex.slice(0, 8);
  const abiParamsHex = calldataHex.slice(8);

  const methodSig = resolveMethodSignature(selectorHex);
  console.info('[TezosX Relayer] gateway selector →', `0x${selectorHex}`, '→', methodSig);

  return {
    direction:    'michelson-to-evm',
    contractAddr: NAC_CONTRACT,
    entrypoint:   'call_evm',
    michelineArg: buildCallArg(tx.to, methodSig, abiParamsHex, callback),
    mutezAmount,
    methodSig,
  };
}
