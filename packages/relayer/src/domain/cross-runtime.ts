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
  entrypoint:   'call' | 'call_evm';
  michelineArg: MichelsonV1Expression;
  mutezAmount:  bigint;
  /**
   * Human-readable ABI signature resolved from the 4-byte selector (e.g.
   * "transfer(address,uint256)"). Present only for `call_evm`; a bare native
   * transfer on the `call` entrypoint has no method and leaves this undefined.
   */
  methodSig?:   string;
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

/**
 * A broadcast tz1→0x gateway op, tracked until its synthetic hash resolves to
 * the kernel-synthesized real EVM hash. Held per synthetic hash by the
 * RelayerProvider and persisted (see PendingOpsStore) so resolution survives a
 * lock / account switch / MV3 service-worker eviction. Non-secret: opHashes and
 * a destination/value, nothing that could move funds.
 */
export interface PendingOp {
  l1OpHash:      string;
  from:          string;    // EVM alias of the sender (informational)
  to:            string;    // destination — matched against the synthesized tx's `to`
  value:         string;    // 0x-prefixed wei requested — matched against the tx's `value`
  fromBlock:     string;    // 0x-prefixed hex: EVM block number at send time
  broadcastedAt: number;    // Date.now() at submission, exposed via listPendingOps
  realHash?:     string;    // cached real EVM tx hash once resolved
}
