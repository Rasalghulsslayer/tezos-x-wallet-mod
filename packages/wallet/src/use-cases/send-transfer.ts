/**
 * sendTransfer: routes a transfer to either the native L1 path (signer
 * directly) or the L2 NAC-gateway path (RelayerProvider eth_sendTransaction)
 * based on destination shape + asset. Returns the runtime + the produced
 * hash (synthetic in the L2 case; the orchestrator polls resolveTx
 * separately to swap it for the real EVM hash).
 */

import { detectRuntime } from '../domain/validation';
import type { Container } from '../composition/container';

export interface SendTransferReq {
  to:     string;
  amount: string;                // 0x-prefixed hex wei
  asset:  'XTZ' | 'USDC';
}

export interface SendTransferDeps {
  container: Container;
}

export type SendTransferResult =
  | { runtime: 'l1'; hash: string }
  | { runtime: 'l2'; hash: string };

export async function sendTransfer(
  req:  SendTransferReq,
  deps: SendTransferDeps,
): Promise<SendTransferResult> {
  const dest = detectRuntime(req.to);

  // Same-runtime XTZ → native Michelson runtime transfer, no NAC gateway.
  if (req.asset === 'XTZ' && dest === 'l1') {
    const mutez = (BigInt(req.amount) / 10n ** 12n).toString();
    const opHash = await deps.container.signer.sendNativeTransfer(req.to, mutez);
    return { runtime: 'l1', hash: opHash };
  }

  // Cross-runtime XTZ (tz1 → 0x) or USDC → NAC gateway. Returns the
  // synthetic NAC hash; the orchestrator polls resolveTx to swap it for
  // the kernel-synthesized real EVM hash before showing "Done".
  const synthetic = await deps.container.provider.request({
    method: 'eth_sendTransaction',
    params: [{
      to:    req.to,
      value: req.amount,
      data:  req.asset === 'XTZ' ? '0x' : req.amount,
    }],
  }) as string;
  return { runtime: 'l2', hash: synthetic };
}
