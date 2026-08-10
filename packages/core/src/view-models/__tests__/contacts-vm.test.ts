/**
 * Pure address-book projections shared by both shells: name resolution for a
 * typed recipient, suggestion matching, and the post-send save offer.
 */

import { describe, expect, it } from 'vitest';
import { contactFor, matchContacts, shouldOfferSaveContact } from '../contacts-vm';
import type { Contact } from '../../domain/contact';

const TZ1 = 'tz1ZTKzWZshji8kW45Tg6WPDX7WVrBnRJ9SH';
const EVM = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';   // stored normalized

const BOOK: Contact[] = [
  { address: TZ1, label: 'Treasury', createdAt: 1 },
  { address: EVM, label: 'alice',    createdAt: 2 },
  { address: '0x' + '11'.repeat(20), label: 'Bob (dex)', createdAt: 3 },
];

describe('contactFor', () => {
  it('resolves regardless of 0x casing and surrounding whitespace', () => {
    expect(contactFor(` ${EVM.toUpperCase().replace('0X', '0x')} `, BOOK)?.label).toBe('alice');
    expect(contactFor(TZ1, BOOK)?.label).toBe('Treasury');
  });

  it('returns null for unknown or empty input', () => {
    expect(contactFor('0x' + 'ab'.repeat(20), BOOK)).toBeNull();
    expect(contactFor('   ', BOOK)).toBeNull();
  });
});

describe('matchContacts', () => {
  it('matches by label substring, case-insensitively', () => {
    expect(matchContacts('ALI', BOOK).map((c) => c.label)).toEqual(['alice']);
    expect(matchContacts('dex', BOOK).map((c) => c.label)).toEqual(['Bob (dex)']);
  });

  it('matches by address prefix, case-insensitively', () => {
    expect(matchContacts('tz1ZTK', BOOK).map((c) => c.label)).toEqual(['Treasury']);
    expect(matchContacts('0X5AAE', BOOK).map((c) => c.label)).toEqual(['alice']);
  });

  it('excludes the contact the field already resolves to', () => {
    expect(matchContacts(EVM, BOOK).find((c) => c.address === EVM)).toBeUndefined();
  });

  it('empty query returns the whole book, label-sorted and capped', () => {
    expect(matchContacts('', BOOK).map((c) => c.label)).toEqual(['alice', 'Bob (dex)', 'Treasury']);
    expect(matchContacts('', BOOK, 2)).toHaveLength(2);
  });

  it('no match returns empty', () => {
    expect(matchContacts('zzz', BOOK)).toEqual([]);
  });
});

describe('shouldOfferSaveContact', () => {
  it('offers for a valid unknown address only', () => {
    expect(shouldOfferSaveContact('0x' + 'ab'.repeat(20), BOOK)).toBe(true);
  });

  it('does not offer for a known contact, in any casing', () => {
    expect(shouldOfferSaveContact(EVM.toUpperCase().replace('0X', '0x'), BOOK)).toBe(false);
  });

  it('does not offer for an invalid address', () => {
    expect(shouldOfferSaveContact('tz1abc', BOOK)).toBe(false);
  });
});
