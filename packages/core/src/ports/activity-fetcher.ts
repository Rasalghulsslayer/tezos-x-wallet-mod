/**
 * ActivityFetcher: paginated historical transactions for a holder address.
 * Concrete adapters live under adapters/tezos/ (TzKT) and adapters/evm/
 * (Blockscout). Cursor is opaque — adapters mint and consume their own
 * format; the use-case layer carries an aggregate cursor across sources.
 */

import type { ActivityItem } from '../domain/activity';

export interface ActivityFetcherPage {
  items:   ActivityItem[];
  cursor?: string;
}

export interface ActivityFetcher {
  list(args: {
    holder: string;
    limit:  number;
    cursor?: string;
  }): Promise<ActivityFetcherPage>;
}
