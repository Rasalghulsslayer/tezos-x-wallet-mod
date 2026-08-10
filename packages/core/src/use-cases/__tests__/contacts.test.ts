/**
 * Address-book use-cases against an in-memory ContactStore: validation runs
 * through the real core validators (so EIP-55 rules apply), identity is the
 * normalized address, the cap and duplicate guards hold, and list order is
 * stable label-sorted.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { addContact } from '../add-contact';
import { renameContact } from '../rename-contact';
import { removeContact } from '../remove-contact';
import { listContacts } from '../list-contacts';
import {
  type Contact,
  ContactAlreadyExistsError,
  ContactNotFoundError,
  MaxContactsReachedError,
} from '../../domain/contact';
import type { ContactStore } from '../../ports/contact-store';
import { MAX_CONTACTS, MAX_LABEL_LENGTH } from '../../shared/constants';

const TZ1 = 'tz1ZTKzWZshji8kW45Tg6WPDX7WVrBnRJ9SH';
// Valid EIP-55 checksum casing (the reference vector from the validation suite).
const EVM_CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
// Mixed casing with a WRONG checksum (canonical is 0xdeAD…, not 0xdEAD…).
const EVM_BAD_CHECKSUM = '0xdEAD000000000000000042000000000000000000';

class MemoryContactStore implements ContactStore {
  private items: Contact[] = [];
  async list() { return [...this.items]; }
  async upsert(c: Contact) {
    this.items = [...this.items.filter((x) => x.address !== c.address), c];
  }
  async remove(address: string) {
    this.items = this.items.filter((x) => x.address !== address);
  }
  async clear() { this.items = []; }
}

describe('addContact', () => {
  let store: MemoryContactStore;
  beforeEach(() => { store = new MemoryContactStore(); });

  it('stores a tz1 verbatim and a 0x lowercased', async () => {
    const a = await addContact({ address: `  ${TZ1}  `, label: 'Alice' }, { contactStore: store });
    const b = await addContact({ address: EVM_CHECKSUMMED, label: 'Bob' }, { contactStore: store });
    expect(a.address).toBe(TZ1);
    expect(b.address).toBe(EVM_CHECKSUMMED.toLowerCase());
  });

  it('rejects a mixed-case 0x address with a wrong EIP-55 checksum (validated before normalization)', async () => {
    await expect(addContact({ address: EVM_BAD_CHECKSUM, label: 'Eve' }, { contactStore: store }))
      .rejects.toThrow('Invalid address');
  });

  it('rejects garbage addresses via the core validators', async () => {
    for (const bad of ['tz1abc', '0x1234', 'hello', '']) {
      await expect(addContact({ address: bad, label: 'X' }, { contactStore: store }))
        .rejects.toThrow('Invalid address');
    }
  });

  it('rejects an empty or over-long label', async () => {
    await expect(addContact({ address: TZ1, label: '   ' }, { contactStore: store }))
      .rejects.toThrow('Contact name is required');
    await expect(addContact({ address: TZ1, label: 'x'.repeat(MAX_LABEL_LENGTH + 1) }, { contactStore: store }))
      .rejects.toThrow('Label too long');
  });

  it('refuses a duplicate even under different 0x casing', async () => {
    await addContact({ address: EVM_CHECKSUMMED, label: 'Bob' }, { contactStore: store });
    await expect(
      addContact({ address: EVM_CHECKSUMMED.toLowerCase(), label: 'Bobby' }, { contactStore: store }),
    ).rejects.toBeInstanceOf(ContactAlreadyExistsError);
  });

  it('enforces the address-book cap', async () => {
    for (let i = 0; i < MAX_CONTACTS; i++) {
      // Distinct all-lowercase 0x addresses carry no checksum info → valid.
      const addr = `0x${i.toString(16).padStart(40, '0')}`;
      await addContact({ address: addr, label: `c${i}` }, { contactStore: store });
    }
    await expect(addContact({ address: TZ1, label: 'One too many' }, { contactStore: store }))
      .rejects.toBeInstanceOf(MaxContactsReachedError);
  });
});

describe('renameContact / removeContact / listContacts', () => {
  let store: MemoryContactStore;
  beforeEach(async () => {
    store = new MemoryContactStore();
    await addContact({ address: TZ1, label: 'zoe' }, { contactStore: store });
    await addContact({ address: EVM_CHECKSUMMED, label: 'Alice' }, { contactStore: store });
  });

  it('renames an existing entry, keeping its address identity', async () => {
    const renamed = await renameContact(
      { address: EVM_CHECKSUMMED, label: 'Alice (work)' },
      { contactStore: store },
    );
    expect(renamed.address).toBe(EVM_CHECKSUMMED.toLowerCase());
    expect(renamed.label).toBe('Alice (work)');
    expect((await store.list())).toHaveLength(2);
  });

  it('rename of an unknown address throws ContactNotFoundError', async () => {
    await expect(
      renameContact({ address: '0x' + 'ff'.repeat(20), label: 'Ghost' }, { contactStore: store }),
    ).rejects.toBeInstanceOf(ContactNotFoundError);
  });

  it('remove is idempotent and normalizes its input', async () => {
    await removeContact({ address: EVM_CHECKSUMMED }, { contactStore: store });
    await removeContact({ address: EVM_CHECKSUMMED }, { contactStore: store });
    expect(await store.list()).toHaveLength(1);
  });

  it('lists label-sorted, case-insensitively', async () => {
    const labels = (await listContacts({ contactStore: store })).map((c) => c.label);
    expect(labels).toEqual(['Alice', 'zoe']);
  });
});
