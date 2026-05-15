/**
 * resolveTx: awaits the kernel-synthesized real EVM hash for a synthetic
 * NAC hash. Returns null inside a resolved-false response when the
 * resolver times out.
 */

import type { Container } from '../composition/container';

export interface ResolveTxReq {
  syntheticHash: string;
}

export interface ResolveTxDeps {
  container: Container;
}

export type ResolveTxResult =
  | { resolved: true;  hash: string }
  | { resolved: false };

export async function resolveTx(
  req:  ResolveTxReq,
  deps: ResolveTxDeps,
): Promise<ResolveTxResult> {
  const real = await deps.container.provider.resolveSyntheticHash(req.syntheticHash);
  return real != null
    ? { resolved: true, hash: real }
    : { resolved: false };
}
