import type { MichelsonV1Expression } from '@taquito/rpc';
import { NAC_ENTRYPOINT } from './constants.js';
import type { EthTransactionRequest } from './types.js';

/**
 * Strip the leading "0x" from a hex string (no-op if already stripped).
 */
function stripHexPrefix(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Return true if the calldata is empty (bare ETH transfer, no function call).
 */
function isEmptyCalldata(calldata: string): boolean {
  const hex = stripHexPrefix(calldata);
  return hex.length === 0;
}

/**
 * Tezos X-specific selectors that 4byte.directory doesn't know about.
 * The NAC gateway expects the full text signature (not the raw hex selector)
 * because it recomputes the selector itself.
 */
const KNOWN_SIGNATURES: Record<string, string> = {
  'a1544fc3': 'callMichelson(string,string,bytes)',
};

/**
 * Look up a 4-byte selector on 4byte.directory to recover the full method
 * signature (e.g. "a9059cbb" → "transfer(address,uint256)").
 *
 * Returns the first (most common) match, or null if not found / unreachable.
 */
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

/**
 * Resolve a 4-byte selector to a full method signature.
 * Checks the local registry first (Tezos X-specific), then falls back to
 * 4byte.directory, then to the raw hex selector as last resort.
 */
async function resolveMethodSignature(selectorHex: string): Promise<string> {
  const known = KNOWN_SIGNATURES[selectorHex];
  if (known) return known;

  const remote = await lookupMethodSignature(selectorHex);
  if (remote) return remote;

  console.warn(
    `[TezosX Relayer] Unknown selector 0x${selectorHex} — using raw hex`,
  );
  return selectorHex;
}

// ── Micheline builders ─────────────────────────────────────────────────────

/**
 * Gateway `default` entrypoint — bare cross-runtime transfer with no calldata.
 */
function buildDefaultArg(destination: string): MichelsonV1Expression {
  return { string: destination };
}

/** Gateway `call_evm` entrypoint — cross-runtime call with ABI-encoded parameters. */
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

// ── Public interface ───────────────────────────────────────────────────────

export interface GatewayCallParams {
  entrypoint:   string;
  michelineArg: MichelsonV1Expression;
  mutezAmount:  string;
}

export class GatewayBuilder {
  /**
   * Build the NAC gateway call parameters from an EVM transaction request.
   * @param tx        EthTransactionRequest from eth_sendTransaction params[0]
   * @param callback  Optional Michelson callback (default: None)
   */
  async fromEthTransaction(
    tx: EthTransactionRequest,
    callback: MichelsonV1Expression = { prim: 'None' },
  ): Promise<GatewayCallParams> {
    const calldata = tx.data ?? '0x';

    // Convert EVM wei value to mutez (1 tez = 10^6 mutez = 10^18 wei)
    const weiValue    = tx.value != null ? BigInt(tx.value) : 0n;
    const mutezAmount = weiValue > 0n
      ? (weiValue / 1_000_000_000_000n).toString()
      : '0';

    // ── Case 1: bare transfer, no calldata ─────────────────────────────────
    if (isEmptyCalldata(calldata)) {
      return {
        entrypoint:   'default',
        michelineArg: buildDefaultArg(tx.to),
        mutezAmount,
      };
    }

    // ── Case 2: contract call with calldata ────────────────────────────────
    const calldataHex  = stripHexPrefix(calldata);
    const selectorHex  = calldataHex.slice(0, 8);          // first 4 bytes
    const abiParamsHex = calldataHex.slice(8);             // everything after selector

    // Resolve the full method signature from the 4-byte selector.
    // Checks local registry first (Tezos X-specific), then 4byte.directory.
    const methodSig = await resolveMethodSignature(selectorHex);

    return {
      entrypoint:   NAC_ENTRYPOINT,
      michelineArg: buildCallArg(tx.to, methodSig, abiParamsHex, callback),
      mutezAmount,
    };
  }
}
