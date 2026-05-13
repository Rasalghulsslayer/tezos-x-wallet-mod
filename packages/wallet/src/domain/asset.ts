/**
 * Asset, AssetBalance, AssetId. Extended via the custom-token registry in W7.
 */

export type AssetId = 'XTZ' | 'USDC';

export interface Asset {
  id:               AssetId;
  symbol:           string;
  decimals:         number;
  runtime:          'michelson' | 'evm';
  contractAddress?: string;
}

export interface AssetBalance {
  asset:  AssetId;
  amount: bigint;
}
