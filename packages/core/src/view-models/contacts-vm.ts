/**
 * Pure projections for the address book, shared by both shells (like
 * account-card-vm): recipient suggestions while typing in Send, name
 * resolution for a typed address, and the post-send save offer.
 */

import { type Contact, normalizeContactAddress } from '../domain/contact';
import { isValidAddress } from '../domain/validation';

/** The contact saved for `address`, or null. */
export function contactFor(address: string, contacts: readonly Contact[]): Contact | null {
  const norm = normalizeContactAddress(address);
  if (norm === '') return null;
  return contacts.find((c) => c.address === norm) ?? null;
}

/**
 * Suggestions for the recipient field: match by label substring or address
 * prefix (both case-insensitive), exclude the entry the field already resolves
 * to (its name is shown instead of a suggestion), label-sorted, capped.
 * An empty query returns the whole book (capped) so focusing the empty field
 * can offer the user's contacts up front.
 */
export function matchContacts(query: string, contacts: readonly Contact[], limit = 5): Contact[] {
  const q    = query.trim().toLowerCase();
  const norm = normalizeContactAddress(query);
  const pool = contacts.filter((c) => c.address !== norm);
  const hits = q === ''
    ? pool
    : pool.filter((c) => c.label.toLowerCase().includes(q) || c.address.toLowerCase().startsWith(q));
  return [...hits]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit);
}

/** After a successful send: offer to save the destination when it is a valid
 *  address the book doesn't know yet. */
export function shouldOfferSaveContact(address: string, contacts: readonly Contact[]): boolean {
  return isValidAddress(address.trim()) && contactFor(address, contacts) == null;
}
