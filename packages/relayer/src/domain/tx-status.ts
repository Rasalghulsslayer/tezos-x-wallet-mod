/**
 * CrossTxStatus: state machine for a cross-runtime transaction tracked
 * from broadcast through finalisation on both source and target runtimes.
 */

export type CrossTxStatus =
  | { stage: 'broadcasting' }
  | { stage: 'included-source';   sourceBlock: number }
  | { stage: 'included-target';   sourceBlock: number; targetBlock: number }
  | { stage: 'finalized';         sourceBlock: number; targetBlock: number; confirmations: number }
  | { stage: 'failed';            reason: string }
  | { stage: 'unresolved-target'; sourceBlock: number };
