/**
 * PendingOpsStore: persists the RelayerProvider's cross-runtime resolution
 * state (the synthetic→real hash tracking) so it survives a lock, an account
 * switch, or an MV3 service-worker eviction mid-resolution. Without it, a
 * synthetic NAC hash becomes unresolvable after any of those — a stuck Send
 * timeline and a dead explorer link — and the claimed-hash dedup is lost.
 *
 * The data is non-secret (op hashes, a destination and value). A store instance
 * is scoped to a single account by the host, so a rebuilt provider only ever
 * rehydrates its own account's ops.
 */

import type { PendingOp } from '../domain/cross-runtime.js';

export interface PendingOpsSnapshot {
  ops:     Record<string, PendingOp>;  // keyed by synthetic hash
  claimed: string[];                    // real hashes already claimed (dedup)
}

export interface PendingOpsStore {
  load():  Promise<PendingOpsSnapshot | undefined>;
  save(snapshot: PendingOpsSnapshot): Promise<void>;
  clear(): Promise<void>;
}
