/**
 * listContacts: the address book, label-sorted (case-insensitive) so both
 * shells render the same stable order without re-sorting.
 */

import type { Contact } from '../domain/contact';
import type { ContactStore } from '../ports/contact-store';

export interface ListContactsDeps {
  contactStore: ContactStore;
}

export async function listContacts(deps: ListContactsDeps): Promise<Contact[]> {
  const contacts = await deps.contactStore.list();
  return [...contacts].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}
