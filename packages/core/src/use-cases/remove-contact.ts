/**
 * removeContact: drop an entry from the address book. Idempotent — removing
 * an unknown address is a no-op, matching the token registry's behaviour.
 */

import { normalizeContactAddress } from '../domain/contact';
import type { ContactStore } from '../ports/contact-store';

export interface RemoveContactReq {
  address: string;
}

export interface RemoveContactDeps {
  contactStore: ContactStore;
}

export async function removeContact(req: RemoveContactReq, deps: RemoveContactDeps): Promise<void> {
  await deps.contactStore.remove(normalizeContactAddress(req.address));
}
