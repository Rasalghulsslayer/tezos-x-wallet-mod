/**
 * TransferRequest, TransferRoute, decideRoute. Pure routing helper that
 * picks among the four valid combinations of source account kind × target
 * address runtime.
 */

import type { Account } from './account';
import type { AssetId } from './asset';
import type { RuntimeId } from './chain';
import { detectRuntime } from './validation';

export interface TransferRequest {
  fromAccountId: string;
  toAddress:     string;
  asset:         AssetId;
  amount:        bigint;
  memo?:         string;
}

export interface TransferRoute {
  sourceChain: RuntimeId;
  targetChain: RuntimeId;
  via:         'native' | 'nac-gateway-l1' | 'nac-precompile-l2';
}

export function decideRoute(
  account:   Account,
  toAddress: string,
): TransferRoute {
  const sourceChain: RuntimeId = account.kind === 'tezos' ? 'michelson' : 'evm';
  const dest = detectRuntime(toAddress);
  if (dest === null) {
    throw new Error(`Invalid destination address: ${toAddress}`);
  }
  const targetChain: RuntimeId = dest === 'l1' ? 'michelson' : 'evm';

  if (sourceChain === targetChain) {
    return { sourceChain, targetChain, via: 'native' };
  }
  if (sourceChain === 'michelson') {
    return { sourceChain, targetChain, via: 'nac-gateway-l1' };
  }
  return { sourceChain, targetChain, via: 'nac-precompile-l2' };
}