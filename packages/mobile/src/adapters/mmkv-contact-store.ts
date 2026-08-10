/**
 * MmkvContactStore: the wallet-global address book (non-secret metadata) in
 * MMKV, one JSON array under a single key — unlike the per-account token
 * registry, contacts belong to the user, not an account. Mirrors the
 * MmkvSessionStore shape against the ContactStore port.
 */

import type { MMKV } from 'react-native-mmkv';
import type { ContactStore } from '@tezosx/wallet-core/ports/contact-store';
import type { Contact } from '@tezosx/wallet-core/domain/contact';

const CONTACTS_KEY = 'contacts';

export class MmkvContactStore implements ContactStore {
  constructor(private readonly mmkv: MMKV) {}

  private read(): Contact[] {
    const raw = this.mmkv.getString(CONTACTS_KEY);
    return raw == null ? [] : (JSON.parse(raw) as Contact[]);
  }

  private write(contacts: Contact[]): void {
    this.mmkv.set(CONTACTS_KEY, JSON.stringify(contacts));
  }

  async list(): Promise<Contact[]> {
    return this.read();
  }

  async upsert(contact: Contact): Promise<void> {
    const next = this.read().filter((c) => c.address !== contact.address);
    next.push(contact);
    this.write(next);
  }

  async remove(address: string): Promise<void> {
    this.write(this.read().filter((c) => c.address !== address));
  }

  async clear(): Promise<void> {
    this.mmkv.remove(CONTACTS_KEY);
  }
}
