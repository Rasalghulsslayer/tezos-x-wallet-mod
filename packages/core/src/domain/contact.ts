/**
 * Contact: a named address-book entry — non-secret metadata (a user-chosen
 * label over a public tz1/tz2/tz3/KT1 or 0x address). Wallet-global, unlike
 * the per-account token registry: an address book belongs to the user, and
 * every account sends to the same peers. Pure data + error classes; persisted
 * via the ContactStore port.
 */

import { MAX_LABEL_LENGTH } from '../shared/constants';

export interface Contact {
  /** Base58 addresses verbatim (case-sensitive); 0x addresses lowercased. */
  address:   string;
  label:     string;
  createdAt: number;    // ms epoch
}

/**
 * Identity normalization: base58 addresses compare verbatim, hex addresses
 * case-insensitively — an EIP-55 checksum is display casing, not identity.
 * Validation happens BEFORE this (on the raw input), so a bad checksum is
 * rejected rather than laundered by the lowercasing.
 */
export function normalizeContactAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith('0x') ? trimmed.toLowerCase() : trimmed;
}

/** Trim + bound a contact label; throws on empty or over-long input. */
export function cleanContactLabel(label: string): string {
  const trimmed = label.trim();
  if (trimmed === '') throw new Error('Contact name is required');
  if (trimmed.length > MAX_LABEL_LENGTH) {
    throw new Error(`Label too long (max ${MAX_LABEL_LENGTH})`);
  }
  return trimmed;
}

export class ContactAlreadyExistsError extends Error {
  constructor(public readonly existing: Contact) {
    super(`${existing.address} is already saved as "${existing.label}"`);
    this.name = 'ContactAlreadyExistsError';
  }
}

export class ContactNotFoundError extends Error {
  constructor(public readonly address: string) {
    super(`No contact saved for ${address}`);
    this.name = 'ContactNotFoundError';
  }
}

export class MaxContactsReachedError extends Error {
  constructor(public readonly cap: number) {
    super(`The address book already holds ${cap} contacts`);
    this.name = 'MaxContactsReachedError';
  }
}
