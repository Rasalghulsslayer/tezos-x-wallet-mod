/**
 * TokenStore: per-account ERC-20 registry persistence.
 * Storage shape is opaque; key collision handled by the adapter.
 */

import type { AccountId } from '../domain/account';
import type { RegisteredToken } from '../domain/token';

export interface TokenStore {
  list(accountId:   AccountId):                          Promise<RegisteredToken[]>;
  upsert(accountId: AccountId, token: RegisteredToken):  Promise<void>;
  remove(accountId: AccountId, address: string):         Promise<void>;
  clear():                                                Promise<void>;
}
