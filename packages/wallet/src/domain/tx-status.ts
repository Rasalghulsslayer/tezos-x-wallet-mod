/**
 * TxStatus: state machine for a wallet-initiated transaction (L1 native or
 * L2 cross-runtime), streamed from broadcast through finalisation.
 */

export type TxStatus =
  | { stage: 'broadcasting' }
  | { stage: 'included';    blockLevel: number; timestampMs: number }
  | { stage: 'finalized';   blockLevel: number; confirmations: number }
  | { stage: 'failed';      reason: string }
  | { stage: 'unavailable' };
