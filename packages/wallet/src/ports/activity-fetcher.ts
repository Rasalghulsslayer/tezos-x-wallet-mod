/**
 * ActivityFetcher: paginated historical transactions for an account holder.
 * Concrete adapters arrive with the Activity work in W7.
 */

export interface ActivityItem {
  hash:      string;
  timestamp: number;
  direction: 'sent' | 'received';
  amount:    bigint;
  asset:     string;
  status:    'pending' | 'confirmed' | 'failed';
}

export interface ActivityPage {
  items:   ActivityItem[];
  cursor?: string;
}

export interface ActivityFetcher {
  list(args: { holder: string; limit: number; cursor?: string }): Promise<ActivityPage>;
}
