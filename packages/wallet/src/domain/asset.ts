/**
 * Asset discriminated union (xtz | erc20) + AssetBalance.
 * AssetId is a legacy alias kept during the CT1–CT4 migration window
 * (USDC re-modelling in CT4 removes the literal string special-cases).
 */

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

/** @deprecated CT1 legacy alias — removed in CT4 once USDC is re-modelled. */
export type AssetId = 'XTZ' | 'USDC';
