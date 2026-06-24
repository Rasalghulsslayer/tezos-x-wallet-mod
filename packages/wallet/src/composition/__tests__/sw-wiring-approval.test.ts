import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Keyring } from '../../background/keyring';
import { ApprovalQueue } from '../../background/approval-queue';
import { ContainerCache } from '../container-cache';
import { dispatch, type SwDeps } from '../sw-wiring';
import type { ContentPush } from '../../shared/messages';
import type { VaultStore, EncryptedVault } from '../../ports/vault-store';
import type { SessionStore, StoredSession } from '../../ports/session-store';
import type { TokenStore } from '../../ports/token-store';
import type { NotificationPort } from '../../ports/notification-port';
import type { RegisteredToken } from '../../domain/token';

class MemoryVault implements VaultStore {
  private v: EncryptedVault | undefined;
  async load() { return this.v; }
  async save(v: EncryptedVault) { this.v = v; }
  async clear() { this.v = undefined; }
}
class MemorySessions implements SessionStore {
  private map = new Map<string, StoredSession>();
  async list() { return Array.from(this.map.values()); }
  async upsert(s: StoredSession) { this.map.set(s.origin, s); }
  async remove(origin: string) { this.map.delete(origin); }
  async clear() { this.map.clear(); }
}
class MemoryTokens implements TokenStore {
  private map = new Map<string, RegisteredToken[]>();
  async list(id: string) { return this.map.get(id) ?? []; }
  async upsert(id: string, t: RegisteredToken) { this.map.set(id, [...(this.map.get(id) ?? []), t]); }
  async remove(id: string, addr: string) {
    this.map.set(id, (this.map.get(id) ?? []).filter(t => t.address.toLowerCase() !== addr.toLowerCase()));
  }
  async clear() { this.map.clear(); }
}

const stubNotifications: NotificationPort = { async setPendingCount() {} };
const PASSWORD    = 'correct-horse-battery';
const OWN_EXT_ID  = 'test-ext-id';

async function setupHarness() {
  const keyring = new Keyring(new MemoryVault());
  await keyring.create(PASSWORD);
  const broadcasts: ContentPush[] = [];
  const deps: SwDeps = {
    keyring,
    approvalQueue:   new ApprovalQueue(stubNotifications),
    persistentPorts: { vaultStore: new MemoryVault(), sessionStore: new MemorySessions(), tokenStore: new MemoryTokens(), notifications: stubNotifications },
    state:           { container: null, evmAlias: null },
    containerCache:  new ContainerCache(),
    rebuildContainer: async () => {},
    broadcastEvent:   async (push) => { broadcasts.push(push); },
  };
  return { keyring, deps, broadcasts };
}

const senderWithId = (id: string) => ({ id } as chrome.runtime.MessageSender);
// Since #75, dispatch validates senders by shape: privileged popup/approve
// commands must come from an extension-page URL, dApp traffic from a tab.
const extensionPageSender = { url: `chrome-extension://${OWN_EXT_ID}/approve.html` } as chrome.runtime.MessageSender;
const contentSender       = { tab: { id: 1 } as chrome.tabs.Tab } as chrome.runtime.MessageSender;

describe('sw-wiring — approval gating', () => {
  let h: Awaited<ReturnType<typeof setupHarness>>;

  beforeEach(async () => {
    // The sender-id guard reads chrome.runtime.id; the enqueue path opens a
    // chrome.windows popup. Stub the minimum the SW touches in these branches.
    vi.stubGlobal('chrome', {
      runtime: { id: OWN_EXT_ID, getURL: (p: string) => `chrome-extension://${OWN_EXT_ID}/${p}` },
      windows: { create: async () => ({ id: 1 }), remove: async () => {} },
    });
    h = await setupHarness();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rejects RESOLVE_PENDING from a foreign sender (4100 Forbidden sender)', async () => {
    const res = await dispatch(
      { type: 'RESOLVE_PENDING', requestId: 'whatever', decision: 'approve' },
      senderWithId('malicious-extension'),
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
    expect(res.message).toMatch(/Forbidden sender/);
  });

  it('rejects GET_PENDING from a foreign sender (4100)', async () => {
    const res = await dispatch(
      { type: 'GET_PENDING', requestId: 'whatever' },
      senderWithId('malicious-extension'),
      h.deps,
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4100);
  });

  it('lets a same-extension RESOLVE_PENDING past the sender guard (unknown id → invalid params)', async () => {
    const res = await dispatch(
      { type: 'RESOLVE_PENDING', requestId: 'no-such-pending', decision: 'approve' },
      extensionPageSender,
      h.deps,
    );
    // Past the guard: resolvePendingApproval finds no such request → -32602,
    // proving it was NOT short-circuited by the 4100 sender check.
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(-32602);
  });

  it('surfaces 4001 when an eth_requestAccounts approval is rejected by the user', async () => {
    const requestId = 'connect-req-1';
    const pending = dispatch(
      { type: 'ETHEREUM_REQUEST', origin: 'https://dapp.example', requestId, args: { method: 'eth_requestAccounts' } },
      contentSender,
      h.deps,
    );

    // Wait for the request to land in the queue, then reject it as the popup would.
    await vi.waitFor(() => expect(h.deps.approvalQueue.get(requestId)).toBeDefined());
    expect(h.deps.approvalQueue.resolve(requestId, 'reject')).toBe(true);

    const res = await pending;
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.code).toBe(4001);
  });
});
