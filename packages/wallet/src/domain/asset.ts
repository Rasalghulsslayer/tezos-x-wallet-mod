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

/** Canonical XtzAsset values. `amount` is in mutez when L1, wei when L2. */
export const XTZ_L1_ASSET: XtzAsset = { kind: 'xtz', symbol: 'XTZ', decimals: 6,  runtime: 'michelson' };
export const XTZ_L2_ASSET: XtzAsset = { kind: 'xtz', symbol: 'XTZ', decimals: 18, runtime: 'evm' };

/**
 * USDC as an Erc20Asset. Temporary constant used by Home/Send during CT3a;
 * CT4 re-models USDC as a default-seeded entry in the per-account registry
 * and removes this constant in favour of the runtime lookup.
 */
export const USDC_ASSET: Erc20Asset = {
  kind:     'erc20',
  address:  '0xd77420f73b4612a7a99dba8c2afd30a1886b0344',
  symbol:   'USDC',
  name:     'USD Coin',
  decimals: 6,
  runtime:  'evm',
};

/** @deprecated CT1 legacy alias — removed in CT4 once USDC is re-modelled. */
export type AssetId = 'XTZ' | 'USDC';
