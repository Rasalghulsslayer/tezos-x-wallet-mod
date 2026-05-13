import '@/lib/buffer-shim';
import { Keyring } from './keyring';
import { ApprovalQueue } from './approval-queue';
import { buildContainer, persistentPorts } from '../composition/container';
import { dispatch, type SwState, type SwDeps } from '../composition/sw-wiring';
import type { ContentPush } from '../lib/messages';

// ── SW-scoped mutable state (cleared on SW kill) ─────────────────────────────

const state: SwState = {
  container: null,
  evmAlias:  null,
};

void persistentPorts.notifications.setPendingCount(0);

const keyring = new Keyring(persistentPorts.vaultStore);
const queue   = new ApprovalQueue(persistentPorts.notifications);

function rebuildContainer(): void {
  const unlocked = keyring.getUnlocked();
  if (unlocked == null) {
    state.container = null;
    state.evmAlias  = null;
    return;
  }
  state.container = buildContainer({
    tz1:       unlocked.tz1,
    publicKey: unlocked.publicKey,
    secretKey: unlocked.secretKey,
  });

  state.container.provider.on('accountsChanged', (accounts: string[]) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'accountsChanged', data: accounts }),
  );
  state.container.provider.on('chainChanged', (chainId: string) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'chainChanged', data: chainId }),
  );
  state.container.provider.on('connect', (info: { chainId: string }) =>
    void broadcastEvent({ type: 'PROVIDER_EVENT', event: 'connect', data: info }),
  );
  state.container.provider.on('disconnect', (err: { code: number; message: string }) =>
    void broadcastEvent({
      type:  'PROVIDER_EVENT',
      event: 'disconnect',
      data:  { code: err.code, message: err.message },
    }),
  );
}

async function broadcastEvent(push: ContentPush): Promise<void> {
  const sessions = await persistentPorts.sessionStore.list();
  await Promise.all(
    sessions.map(async ({ origin }) => {
      const tabs = await chrome.tabs.query({ url: `${origin}/*` });
      for (const tab of tabs) {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, push).catch(() => {});
        }
      }
    }),
  );
}

const deps: SwDeps = {
  keyring,
  approvalQueue: queue,
  persistentPorts,
  state,
  rebuildContainer,
  broadcastEvent,
};

// ── chrome.* listeners ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void (async () => {
    sendResponse(await dispatch(msg, sender, deps));
  })();
  return true; // keep port open for async
});

chrome.runtime.onInstalled.addListener(() => {
  void persistentPorts.notifications.setPendingCount(0);
  console.info('[TezosX Wallet] service worker installed, v0.6.0');
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of queue.entries()) {
    if (pending.window?.id === windowId) {
      queue.resolve(requestId, 'reject');
    }
  }
});

// Toolbar icon click keeps the popup behavior; the side panel is opt-in.
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn('[TezosX Wallet] sidePanel unavailable:', err));

console.info('[TezosX Wallet] service worker booted');
