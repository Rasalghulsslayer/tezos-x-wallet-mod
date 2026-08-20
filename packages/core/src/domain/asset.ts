/**
 * Asset discriminated union (xtz | erc20) + AssetBalance.
 */

import type { RegisteredToken } from './token';

export type AssetKind = 'xtz' | 'erc20';

export interface XtzAsset {
  kind:     'xtz';
  symbol:   'XTZ';
  decimals: 6 | 18;             // 6 on L1 (mutez), 18 on L2 (wei)
  runtime:  'michelson' | 'evm';
}

export interface Erc20Asset {
  kind:     'erc20';
  address:  string;             // lowercased; EIP-55 only at display time
  symbol:   string;
  name:     string;
  decimals: number;
  runtime:  'evm';              // ERC-20 tokens live on L2 only in 0.10.0
}

export type Asset = XtzAsset | Erc20Asset;

export interface AssetBalance {
  asset:  Asset;
  amount: bigint;
}

/** Canonical XtzAsset values. `amount` is in mutez when L1, wei when L2. */
export const XTZ_L1_ASSET: XtzAsset = { kind: 'xtz', symbol: 'XTZ', decimals: 6,  runtime: 'michelson' };
export const XTZ_L2_ASSET: XtzAsset = { kind: 'xtz', symbol: 'XTZ', decimals: 18, runtime: 'evm' };

/** Project a registry entry into the Asset shape send/balance paths consume. */
export function erc20AssetFromToken(t: RegisteredToken): Erc20Asset {
  return { kind: 'erc20', address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals, runtime: 'evm' };
}
