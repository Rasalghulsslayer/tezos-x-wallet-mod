/**
 * buildEvmToTezosTx: wallet-side wrapper around @tezosx/relayer/evm's
 * buildCrossRuntimeTx, bound to the wallet's Tezlink/L1 endpoints via a
 * minimal HTTP JSON-RPC transport.
 */

import { buildCrossRuntimeTx, type EvmCrossRuntimeTx } from '@tezosx/relayer/evm';
import type {
  CrossRuntimeIntent,
  JsonRpcTransport,
  TransportPort,
} from '@tezosx/relayer/types';
import { TEZLINK_EVM_RPC, TEZOS_L1_RPC } from '@tezosx/relayer/constants';

class HttpJsonRpcTransport implements JsonRpcTransport {
  constructor(private readonly url: string) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.url, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as { result?: T; error?: { message: string } };
    if (json.error != null) throw new Error(json.error.message);
    return json.result as T;
  }
}

const defaultTransport: TransportPort = {
  evmRpc:     new HttpJsonRpcTransport(TEZLINK_EVM_RPC),
  tezosL1Rpc: new HttpJsonRpcTransport(TEZOS_L1_RPC),
};

export type { EvmCrossRuntimeTx };

export function buildEvmToTezosTx(
  intent:      CrossRuntimeIntent,
  fromAddress: `0x${string}`,
): Promise<EvmCrossRuntimeTx> {
  return buildCrossRuntimeTx(intent, fromAddress, defaultTransport);
}
