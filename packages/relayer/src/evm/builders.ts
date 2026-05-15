/**
 * buildCrossRuntimeTx: turns a CrossRuntimeIntent into a fully-populated EVM
 * transaction (to, data, value, gasLimit, nonce, chainId) ready to be
 * signed and broadcast. Uses buildEvmToTezosCall for the calldata and
 * fetches nonce and chainId from the EVM RPC.
 */

import type { CrossRuntimeIntent } from '../domain/intent.js';
import type { TransportPort } from '../ports/transport.js';
import { buildEvmToTezosCall } from '../use-cases/build-evm-to-tezos-call.js';

export interface EvmCrossRuntimeTx {
  to:       `0xff${string}`;
  data:     `0x${string}`;
  value:    bigint;
  gasLimit: bigint;
  nonce:    bigint;
  chainId:  bigint;
}

export async function buildCrossRuntimeTx(
  intent:      CrossRuntimeIntent,
  fromAddress: `0x${string}`,
  transport:   TransportPort,
): Promise<EvmCrossRuntimeTx> {
  const call = buildEvmToTezosCall(intent);

  const [chainIdHex, nonceHex] = await Promise.all([
    transport.evmRpc.call<string>('eth_chainId'),
    transport.evmRpc.call<string>('eth_getTransactionCount', [fromAddress, 'latest']),
  ]);

  return {
    to:       call.to,
    data:     call.data,
    value:    call.value,
    gasLimit: call.gasLimit,
    nonce:    BigInt(nonceHex),
    chainId:  BigInt(chainIdHex),
  };
}
