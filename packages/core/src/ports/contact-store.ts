/**
 * ContactStore: address-book persistence. Wallet-global — unlike the
 * per-account TokenStore — because contacts are the user's, not an account's.
 * Entries are non-secret metadata (public addresses + labels); the storage
 * shape is opaque to the core and owned by each platform adapter.
 */

import type { Contact } from '../domain/contact';

export interface ContactStore {
  list():                   Promise<Contact[]>;
  upsert(contact: Contact): Promise<void>;
  /** `address` must already be identity-normalized (normalizeContactAddress). */
  remove(address: string):  Promise<void>;
  clear():                  Promise<void>;
}
