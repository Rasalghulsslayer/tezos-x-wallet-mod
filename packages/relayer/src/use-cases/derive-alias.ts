/**
 * Use cases for the deterministic tz1 ↔ 0x alias mapping under Tezos X.
 */

import { TEZLINK_EVM_RPC } from '../shared/constants.js';
import { jsonRpc } from '../shared/rpc.js';

export async function deriveEvmAlias(tz1: string): Promise<string> {
  return jsonRpc<string>(TEZLINK_EVM_RPC, 'tez_getTezosEthereumAddress', [tz1]);
}

export async function resolveTezosAddress(evmAddress: string): Promise<string> {
  return jsonRpc<string>(TEZLINK_EVM_RPC, 'tez_getEthereumTezosAddress', [evmAddress]);
}
