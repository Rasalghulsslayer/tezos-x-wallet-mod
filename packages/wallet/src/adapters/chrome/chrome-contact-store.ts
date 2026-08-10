/**
 * ChromeContactStore: ContactStore backed by chrome.storage.local under the
 * single wallet-global 'contacts' key — the address book belongs to the user,
 * not an account, so there is no per-account keying (and no key index: one
 * fixed key is enough for clear()). Entries arrive identity-normalized from
 * the core (normalizeContactAddress), so dedupe compares addresses verbatim.
 */

import type { ContactStore } from '@tezosx/wallet-core/ports/contact-store';
import type { Contact } from '@tezosx/wallet-core/domain/contact';

const KEY = 'contacts';

export class ChromeContactStore implements ContactStore {
  async list(): Promise<Contact[]> {
    const data = await chrome.storage.local.get(KEY);
    return (data[KEY] as Contact[] | undefined) ?? [];
  }

  async upsert(contact: Contact): Promise<void> {
    const list = await this.list();
    const idx  = list.findIndex((c) => c.address === contact.address);
    const next = idx === -1
      ? [...list, contact]
      : list.map((c, i) => (i === idx ? contact : c));
    await chrome.storage.local.set({ [KEY]: next });
  }

  async remove(address: string): Promise<void> {
    const list = await this.list();
    const next = list.filter((c) => c.address !== address);
    if (next.length === list.length) return;
    await chrome.storage.local.set({ [KEY]: next });
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove(KEY);
  }
}
