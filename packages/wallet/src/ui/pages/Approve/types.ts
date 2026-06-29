import type { AccountSummary } from '@tezosx/wallet-core/shared/messages';

export type Stage = 'request' | 'signing' | 'done' | 'error';

export interface AccountContext {
  pinned:        AccountSummary | null;
  fallbackLabel: string;
  currentActive: string;
}
