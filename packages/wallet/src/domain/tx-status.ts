/**
 * TxStatus: state machine for a wallet-initiated transaction (L1 native or
 * L2 cross-runtime), streamed from broadcast through finalisation.
 *
 * Finality is asymmetric across runtimes:
 *
 * - **L1 native (tz1 → tz1)**: a Tezos block is final after 2 Tenderbake
 *   attestation rounds. `confirmations` carries that delta (head.level -
 *   op.level) for the L1 path.
 *
 * - **L2 EVM (cross-runtime, NAC gateway, EVM-source)**: a Tezlink block
 *   is final when it is included in a finalised L1 Tezos block, surfaced
 *   via the `finalized` block tag on `eth_getBlockByNumber`. The L2 path
 *   carries `finalizedBlockLevel` (the latest finalised L2 block number
 *   known to the RPC); the tx is finalised when `blockLevel <=
 *   finalizedBlockLevel`. Counting blocks above the tx, as Ethereum
 *   mainnet does, is incorrect on Tezos X — L2 finality is driven by L1
 *   inclusion, not by a sequencer's block count.
 */

export type TxStatus =
  | { stage: 'broadcasting' }
  | { stage: 'included';    blockLevel: number; timestampMs: number }
  | { stage: 'finalized';   blockLevel: number; confirmations?: number; finalizedBlockLevel?: number }
  | { stage: 'failed';      reason: string }
  | { stage: 'unavailable' };
