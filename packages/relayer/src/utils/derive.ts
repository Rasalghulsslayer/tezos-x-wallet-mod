import { TEZLINK_EVM_RPC } from '../shared/constants.js';
import { jsonRpc } from '../shared/rpc.js';

/**
 * Derive the deterministic EVM alias (0x...) for a Tezos tz1 address.
 *
 * Uses the Tezos X proprietary RPC method `tez_getTezosEthereumAddress`,
 * which is exposed on the EVM endpoint (TEZLINK_EVM_RPC), NOT on the L1 RPC.
 *
 * Confirmed mapping on testnet:
 *   tz1KqTpEZ7Yob7QbPE4Hy4Wo8fHG8LhKxZSx → 0x341af4de1e67241d8d2536b2ea47c7e9debf7cb2
 */
export async function deriveEvmAlias(tz1: string): Promise<string> {
  return jsonRpc<string>(TEZLINK_EVM_RPC, 'tez_getTezosEthereumAddress', [tz1]);
}

/**
 * Reverse lookup: resolve a 0x EVM address back to its tz1 Tezos address.
 * Useful for debugging.
 */
export async function resolveTezosAddress(evmAddress: string): Promise<string> {
  return jsonRpc<string>(TEZLINK_EVM_RPC, 'tez_getEthereumTezosAddress', [evmAddress]);
}
