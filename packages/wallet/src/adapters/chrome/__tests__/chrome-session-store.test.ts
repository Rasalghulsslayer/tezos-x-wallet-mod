/**
 * `ChromeSessionStore` — session identity is origin PLUS protocol.
 *
 * This file exists because the fix it covers had NO test. All three sw-wiring
 * doubles implemented the pre-fix semantics (`map.set(session.origin, session)`),
 * so reverting the adapter to key on origin alone left the whole suite green —
 * and the correct coexistence test could not even be written, because against a
 * double that evicts by origin it would have read red for the right reason.
 *
 * What is at stake: the MAPS dApp connects over BOTH surfaces, an EVM path and a
 * native Michelson one. Keyed on origin alone, the second connect silently
 * revoked the first — a grant the user had given, withdrawn without telling
 * either side.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { StoredSession } from '@tezosx/wallet-core/ports/session-store';
import { ChromeSessionStore } from '../chrome-session-store';

const ORIGIN = 'https://maps.example';

function stubChrome(initial: Record<string, unknown> = {}) {
  const state = { store: { ...initial } as Record<string, unknown> };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        async get(key: string) { return key in state.store ? { [key]: state.store[key] } : {}; },
        async set(items: Record<string, unknown>) { Object.assign(state.store, items); },
        async remove(key: string) { delete state.store[key]; },
      },
    },
  });
  return state;
}

const eip = (origin = ORIGIN): StoredSession => ({
  origin, accountId: 'acct-1', tz1Address: 'tz1aaa',
  evmAlias: '0x' + '11'.repeat(20), chainId: '0x1f440', connectedAt: 1,
});

const beacon = (origin = ORIGIN): StoredSession => ({
  origin, accountId: 'acct-1', protocol: 'beacon', tz1Address: 'tz1aaa',
  evmAlias: '', chainId: '', connectedAt: 2,
});

describe('ChromeSessionStore', () => {
  let state: ReturnType<typeof stubChrome>;
  let store: ChromeSessionStore;

  beforeEach(() => { state = stubChrome(); store = new ChromeSessionStore(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps an EIP-1193 and a Beacon session for the SAME origin', async () => {
    await store.upsert(eip());
    await store.upsert(beacon());

    const all = await store.list();
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.protocol === 'beacon')).toHaveLength(1);
    expect(all.filter((s) => s.protocol == null)).toHaveLength(1);
  });

  it('does not care which order they arrive in', async () => {
    await store.upsert(beacon());
    await store.upsert(eip());
    expect(await store.list()).toHaveLength(2);
  });

  it('replaces same-protocol, same-origin rather than appending', async () => {
    await store.upsert(beacon());
    await store.upsert({ ...beacon(), connectedAt: 99 });
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].connectedAt).toBe(99);
  });

  it('keeps different origins apart', async () => {
    await store.upsert(eip());
    await store.upsert(eip('https://other.example'));
    expect(await store.list()).toHaveLength(2);
  });

  it('remove(origin) revokes EVERY protocol for that origin', async () => {
    // Disconnect revokes the SITE, not one of the two ways it connected.
    await store.upsert(eip());
    await store.upsert(beacon());
    await store.upsert(eip('https://other.example'));

    await store.remove(ORIGIN);
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].origin).toBe('https://other.example');
  });

  it('gives an EIP-1193 session the BARE ORIGIN as its key, so old data needs no migration', async () => {
    // Every session written before Beacon existed is stored under its origin.
    // Changing that key would have orphaned them all.
    await store.upsert(eip());
    const map = state.store.sessions as Record<string, StoredSession>;
    expect(Object.keys(map)).toEqual([ORIGIN]);
  });

  it('reads a pre-existing origin-keyed session written by an older build', async () => {
    state.store.sessions = { [ORIGIN]: eip() };
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].evmAlias).toBe('0x' + '11'.repeat(20));

    // …and it is still replaceable and removable through the new keying.
    await store.upsert({ ...eip(), connectedAt: 7 });
    expect(await store.list()).toHaveLength(1);
    await store.remove(ORIGIN);
    expect(await store.list()).toHaveLength(0);
  });

  it('clear() drops everything', async () => {
    await store.upsert(eip());
    await store.upsert(beacon());
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});
