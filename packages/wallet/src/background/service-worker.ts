import '@tezosx/wallet-core/shared/buffer-shim';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { ApprovalQueue } from '@tezosx/wallet-core/approval-queue';
import { ChromeVaultStore } from '../adapters/chrome/chrome-vault-store';
import { ChromeSessionStore } from '../adapters/chrome/chrome-session-store';
import { ChromeTokenStore } from '../adapters/chrome/chrome-token-store';
import { ChromeNotificationPort } from '../adapters/chrome/chrome-notification';
import { WebCryptoPort } from '../adapters/crypto/web-crypto-port';
import { classifyChromeSender } from '../adapters/chrome/chrome-message-source';
import { ChromeApprovalPresenter } from '../adapters/chrome/chrome-approval-presenter';
import type { PersistentPorts } from '@tezosx/wallet-core/ports/container';
import { ContainerCache } from '../composition/container-cache';
import { ensureContainerFor } from '../composition/container-builder';
import { dispatch, type SwState, type SwDeps } from '../composition/sw-wiring';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';

const state: SwState = {
  container: null,
  evmAlias:  null,
};

// The extension shell owns the platform adapters and injects them into the
// shared core (keyring, container, dispatch). A mobile shell would build its
// own PersistentPorts here (Keychain / MMKV / …) instead.
const persistentPorts: PersistentPorts = {
  vaultStore:    new ChromeVaultStore(),
  sessionStore:  new ChromeSessionStore(),
  tokenStore:    new ChromeTokenStore(),
  notifications: new ChromeNotificationPort(),
};

void persistentPorts.notifications.setPendingCount(0);

// Web Crypto is the platform's crypto primitive here; a mobile shell would
// inject a @noble-backed CryptoPort instead (see adapters/crypto).
const cryptoPort = new WebCryptoPort();

const keyring        = new Keyring(persistentPorts.vaultStore, cryptoPort);
const queue          = new ApprovalQueue(persistentPorts.notifications, new ChromeApprovalPresenter());
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
    await broadcastEvent({ type: 'WALLET_ROLE', routesViaRelayer: false });
    return;
  }
  state.container = await ensureContainerFor(unlocked.account.id, {
    keyring,
    containerCache,
    persistentPorts,
    onProviderEvent: broadcastEvent,
  });
  await broadcastEvent({ type: 'WALLET_ROLE', routesViaRelayer: unlocked.account.kind === 'tezos' });
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
    sendResponse(await dispatch(msg, classifyChromeSender(sender), deps));
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void persistentPorts.notifications.setPendingCount(0);
  console.info('[TezosX Wallet] service worker installed, v0.11.3');
});

chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.warn('[TezosX Wallet] sidePanel unavailable:', err));

console.info('[TezosX Wallet] service worker booted');
