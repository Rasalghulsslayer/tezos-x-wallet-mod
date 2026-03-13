import type { MichelineMichelsonV1Expression } from '@airgap/beacon-sdk';
import { CRAC_ENTRYPOINT } from './constants.js';
import type { EthTransactionRequest } from './types.js';

/**
 * Extract the EVM function selector (first 4 bytes of calldata) as a hex
 * string without 0x prefix (e.g. "a9059cbb"). Returns empty string for
 * bare ETH transfers with no calldata.
 */
function extractSelector(calldata: string): string {
  const hex = calldata.startsWith('0x') ? calldata.slice(2) : calldata;
  return hex.slice(0, 8); // 4 bytes = 8 hex chars
}

/**
 * Strip the leading "0x" from a hex string (no-op if already stripped).
 */
function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Construct the Micheline value for the CRAC gateway `call` entrypoint.
 *
 * Assumed Michelson parameter type (spec-derived — /entrypoints endpoint is
 * unavailable on this node):
 *
 *   parameter (pair (string %destination) (pair (string %entrypoint) (bytes %data)))
 *
 * Encoded as a right-comb Pair in Micheline JSON:
 *   {
 *     prim: "Pair",
 *     args: [
 *       { string: "<EVM 0x address>" },
 *       { prim: "Pair", args: [
 *           { string: "<4-byte selector hex>" },
 *           { bytes: "<calldata hex without 0x>" }
 *       ]}
 *     ]
 *   }
 *
 * NOTE: If the actual contract uses `bytes` instead of `string` for
 * `destination`, change `{ string: destination }` to
 * `{ bytes: stripHexPrefix(destination) }`.
 */
function buildMichelineArg(
  destination: string,
  selector: string,
  calldataHex: string,
): MichelineMichelsonV1Expression {
  return {
    prim: 'Pair',
    args: [
      { string: destination },
      {
        prim: 'Pair',
        args: [
          { string: selector },
          { bytes: calldataHex },
        ],
      },
    ],
  };
}

export interface GatewayCallParams {
  entrypoint:   string;
  michelineArg: MichelineMichelsonV1Expression;
  mutezAmount:  string;
}

export class GatewayBuilder {
  /**
   * Build the CRAC gateway call parameters from an EVM transaction request.
   *
   * @param tx  The EthTransactionRequest from eth_sendTransaction params[0]
   */
  fromEthTransaction(tx: EthTransactionRequest): GatewayCallParams {
    const calldata    = tx.data ?? '0x';
    const calldataHex = stripHexPrefix(calldata);
    const selector    = extractSelector(calldata);

    // Convert EVM wei value to mutez (1 tez = 10^6 mutez = 10^18 wei)
    // For V1, we pass 0 mutez and rely on the dApp having assets already on
    // the EVM side. A proper conversion would be: mutez = wei / 10^12.
    const weiValue    = tx.value != null ? BigInt(tx.value) : 0n;
    const mutezAmount = weiValue > 0n
      ? (weiValue / 1_000_000_000_000n).toString()
      : '0';

    return {
      entrypoint:   CRAC_ENTRYPOINT,
      michelineArg: buildMichelineArg(tx.to, selector, calldataHex),
      mutezAmount,
    };
  }
}
