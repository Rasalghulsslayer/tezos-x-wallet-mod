/**
 * renameContact: change the label of an existing address-book entry.
 * The address is the entry's identity and never changes here.
 */

import {
  type Contact,
  ContactNotFoundError,
  cleanContactLabel,
  normalizeContactAddress,
} from '../domain/contact';
import type { ContactStore } from '../ports/contact-store';

export interface RenameContactReq {
  address: string;
  label:   string;
}

export interface RenameContactDeps {
  contactStore: ContactStore;
}

export async function renameContact(req: RenameContactReq, deps: RenameContactDeps): Promise<Contact> {
  const address = normalizeContactAddress(req.address);
  const label   = cleanContactLabel(req.label);

  const existing = (await deps.contactStore.list()).find((c) => c.address === address);
  if (existing == null) throw new ContactNotFoundError(address);

  const next: Contact = { ...existing, label };
  await deps.contactStore.upsert(next);
  return next;
}
