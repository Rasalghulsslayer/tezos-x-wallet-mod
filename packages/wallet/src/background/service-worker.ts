import '@/shared/buffer-shim';
import { Keyring } from './keyring';
import { ApprovalQueue } from './approval-queue';
import { persistentPorts } from '../composition/container';
import { ContainerCache } from '../composition/container-cache';
import { ensureContainerFor } from '../composition/container-builder';
import { dispatch, type SwState, type SwDeps } from '../composition/sw-wiring';
import type { ContentPush } from '../shared/messages';

const state: SwState = {
  container: null,
  evmAlias:  null,
};

void persistentPorts.notifications.setPendingCount(0);

const keyring        = new Keyring(persistentPorts.vaultStore);
const queue          = new ApprovalQueue(persistentPorts.notifications);
const containerCache = new ContainerCache();

async function broadcastEvent(push: ContentPush): Promise<void> {
  const sessions = await persistentPorts.sessionStore.list();
  await Promise.all(
    sessions.map(async ({ origin }) => {
      const tabs = await chrome.tabs.query({ url: `${origin}/*` });
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.sendMessage(tab.id, push).catch(() => {});
      }
    }),
  );
}

async function rebuildContainer(): Promise<void> {
  const unlocked = keyring.getUnlocked();
  if (unlocked == null) {
    state.container = null;
    state.evmAlias  = null;
    return;
  }
  state.container = await ensureContainerFor(unlocked.account.id, {
    keyring,
    containerCache,
    onProviderEvent: broadcastEvent,
  });
}

const deps: SwDeps = {
  keyring,
  approvalQueue: queue,
  persistentPorts,
  state,
  containerCache,
  rebuildContainer,
  broadcastEvent,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  void (async () => {
    sendResponse(await dispatch(msg, sender, deps));
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void persistentPorts.notifications.setPendingCount(0);
  console.info('[TezosX Wallet] service worker installed, v0.11.0');
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of queue.entries()) {
    if (pending.window?.id === windowId) queue.resolve(requestId, 'reject');
  }
});

chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn('[TezosX Wallet] sidePanel unavailable:', err));

console.info('[TezosX Wallet] service worker booted');
