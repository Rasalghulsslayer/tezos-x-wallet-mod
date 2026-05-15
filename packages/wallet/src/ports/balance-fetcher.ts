/**
 * BalanceFetcher: balance reads for an account holder by asset.
 */

import type { AssetId } from '../domain/asset';

export interface BalanceFetcher {
  balanceOf(holder: string, asset: AssetId): Promise<bigint>;
}
