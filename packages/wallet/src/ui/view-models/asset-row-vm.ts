/**
 * AssetRowVM: presentation projection for an Asset + its formatted balance.
 * Consumed by AssetRow (Home assets list) and AssetSelector (Send picker).
 * Pure — no I/O.
 */

import type { Asset } from '../../domain/asset';
import { formatTokenAmount } from '../../shared/format';

export interface AssetRowVM {
  /** Stable React key. For XTZ: 'xtz:l1' / 'xtz:l2'; for ERC-20: 'erc20:<lowercased-address>'. */
  id:               string;
  asset:            Asset;
  symbol:           string;
  runtimeLabel:     'Michelson runtime' | 'EVM runtime';
  runtimeBadge:     'l1' | 'l2';
  /** Pre-formatted balance string (decimals applied). Empty string when balance not yet known. */
  balanceFormatted: string;
}

export function assetRowVM(asset: Asset, rawAmount: string | null): AssetRowVM {
  const runtimeBadge: 'l1' | 'l2' = asset.kind === 'xtz' && asset.runtime === 'michelson' ? 'l1' : 'l2';
  const runtimeLabel = runtimeBadge === 'l1' ? 'Michelson runtime' : 'EVM runtime';
  const id = asset.kind === 'xtz'
    ? `xtz:${runtimeBadge}`
    : `erc20:${asset.address.toLowerCase()}`;
  const balanceFormatted = rawAmount == null ? '' : formatTokenAmount(rawAmount, asset.decimals);
  return {
    id,
    asset,
    symbol: asset.symbol,
    runtimeLabel,
    runtimeBadge,
    balanceFormatted,
  };
}
