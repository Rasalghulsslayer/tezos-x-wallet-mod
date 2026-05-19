/**
 * Cross-runtime call shapes: GatewayCall (michelson-to-evm via the NAC
 * gateway KT1) and PrecompileCall (evm-to-michelson via the NAC precompile),
 * unified as CrossRuntimeCall.
 */

import type { MichelsonV1Expression } from '@taquito/rpc';

export type CrossRuntimeDirection = 'michelson-to-evm' | 'evm-to-michelson';

export interface GatewayCall {
  direction:    'michelson-to-evm';
  contractAddr: string;
  entrypoint:   'default' | 'call_evm';
  michelineArg: MichelsonV1Expression;
  mutezAmount:  bigint;
}

export interface PrecompileCall {
  direction: 'evm-to-michelson';
  to:        `0xff${string}`;
  data:      `0x${string}`;
  value:     bigint;
  gasLimit:  bigint;
}

export type CrossRuntimeCall = GatewayCall | PrecompileCall;

/** Read-only snapshot of a pending L1→L2 op (broadcast, not yet resolved). */
export interface PendingOpView {
  l1OpHash:      string;
  evmAlias:      string;
  to:            string;
  fromBlock:     string;
  broadcastedAt: number;
}
