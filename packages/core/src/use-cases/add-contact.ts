/**
 * addContact: validate the address with the core validators (raw input first,
 * so an invalid EIP-55 checksum is rejected rather than laundered by the
 * lowercase normalization), dedupe against the book, enforce the cap, persist.
 * Returns the stored Contact so the UI can render it immediately.
 */

import {
  type Contact,
  ContactAlreadyExistsError,
  MaxContactsReachedError,
  cleanContactLabel,
  normalizeContactAddress,
} from '../domain/contact';
import type { ContactStore } from '../ports/contact-store';
import { detectRuntime } from '../domain/validation';
import { MAX_CONTACTS } from '../shared/constants';

export interface AddContactReq {
  address: string;
  label:   string;
}

export interface AddContactDeps {
  contactStore: ContactStore;
}

export async function addContact(req: AddContactReq, deps: AddContactDeps): Promise<Contact> {
  const raw = req.address.trim();
  if (detectRuntime(raw) == null) {
    throw new Error('Invalid address — expected tz1/tz2/tz3/KT1 or a 0x address');
  }
  const address = normalizeContactAddress(raw);
  const label   = cleanContactLabel(req.label);

  const existing = await deps.contactStore.list();
  const dup = existing.find((c) => c.address === address);
  if (dup != null) throw new ContactAlreadyExistsError(dup);
  if (existing.length >= MAX_CONTACTS) throw new MaxContactsReachedError(MAX_CONTACTS);

  const contact: Contact = { address, label, createdAt: Date.now() };
  await deps.contactStore.upsert(contact);
  return contact;
}
