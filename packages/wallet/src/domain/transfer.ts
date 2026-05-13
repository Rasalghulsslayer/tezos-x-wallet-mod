/**
 * TransferRequest, TransferRoute, decideRoute. Pure routing helper from
 * an Account + destination address. EVM source branches arrive in W4.
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
  _account:  Account,
  toAddress: string,
): TransferRoute {
  const sourceChain: RuntimeId = 'michelson';
  const dest = detectRuntime(toAddress);
  if (dest === null) {
    throw new Error(`Invalid destination address: ${toAddress}`);
  }
  const targetChain: RuntimeId = dest === 'l1' ? 'michelson' : 'evm';

  if (sourceChain === targetChain) {
    return { sourceChain, targetChain, via: 'native' };
  }
  return { sourceChain, targetChain, via: 'nac-gateway-l1' };
}
