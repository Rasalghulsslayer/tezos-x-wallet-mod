/**
 * BalanceFetcher: balance reads for an account holder by asset.
 * Asset is the discriminated union ({ kind: 'xtz' } | { kind: 'erc20', ... });
 * adapters dispatch on the kind.
 */

import type { Asset } from '../domain/asset';

export interface BalanceFetcher {
  balanceOf(holder: string, asset: Asset): Promise<bigint>;
}
