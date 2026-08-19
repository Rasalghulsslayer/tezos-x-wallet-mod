import '@tezosx/wallet-core/shared/buffer-shim';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { ApprovalQueue } from '@tezosx/wallet-core/approval-queue';
import { ChromeVaultStore } from '../adapters/chrome/chrome-vault-store';
import { ChromeSessionStore } from '../adapters/chrome/chrome-session-store';
import { ChromeTokenStore } from '../adapters/chrome/chrome-token-store';
import { ChromeContactStore } from '../adapters/chrome/chrome-contact-store';
import { ChromeNotificationPort } from '../adapters/chrome/chrome-notification';
import { WebCryptoPort } from '../adapters/crypto/web-crypto-port';
import { classifyChromeSender } from '../adapters/chrome/chrome-message-source';
import { ChromeApprovalPresenter } from '../adapters/chrome/chrome-approval-presenter';
import { ChromeUiPorts } from '../adapters/chrome/chrome-ui-ports';
import { ChromeUnlockGuardStore } from '../adapters/chrome/chrome-unlock-guard-store';
import { ChromePendingOpsStore } from '../adapters/chrome/chrome-pending-ops-store';
import { ChromeAliasStore } from '../adapters/chrome/chrome-alias-store';
import { ChromeSnapshotStore } from '../adapters/chrome/chrome-snapshot-store';
import type { PersistentPorts } from '@tezosx/wallet-core/ports/container';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import { ensureContainerFor } from '@tezosx/wallet-core/composition/container-builder';
import { dispatch, type SwState, type SwDeps } from '@tezosx/wallet-core/composition/sw-wiring';
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
import {
  AUTO_LOCK_ALARM_NAME,
  AUTO_LOCK_ALARM_PERIOD_MINUTES,
  AUTO_LOCK_IDLE_MS,
  checkIdleDeadline,
  recordActivity,
  type AutoLockPorts,
} from './auto-lock';

const state: SwState = {
  container: null,
};

// tz1 → EVM alias entries, persisted through the alias store so they survive
// MV3 eviction (an alias is resolved at most once per tz1 per wallet lifetime).
// Survives lock; cleared on wallet reset by dispatch. The boot-time hydrate is
// fire-and-forget: it's race-safe with the backfill (which awaits it) and a
// GET_STATE that beats it just sees a null alias for one poll cycle.
const aliasStore = new ChromeAliasStore();
const aliasCache = new EvmAliasCache(aliasStore);
void aliasCache.hydrate();

// The extension shell owns the platform adapters and injects them into the
// shared core (keyring, container, dispatch). A mobile shell would build its
// own PersistentPorts here (Keychain / MMKV / …) instead.
const persistentPorts: PersistentPorts = {
  vaultStore:    new ChromeVaultStore(),
  sessionStore:  new ChromeSessionStore(),
  tokenStore:    new ChromeTokenStore(),
  contactStore:  new ChromeContactStore(),
  aliasStore,
  snapshotStore: new ChromeSnapshotStore(),
  notifications: new ChromeNotificationPort(),
  pendingOpsStore: (accountId) => new ChromePendingOpsStore(accountId),
};

void persistentPorts.notifications.setPendingCount(0);

// Web Crypto is the platform's crypto primitive here; a mobile shell would
// inject a @noble-backed CryptoPort instead (see adapters/crypto).
const cryptoPort = new WebCryptoPort();

const keyring        = new Keyring(persistentPorts.vaultStore, cryptoPort, new ChromeUnlockGuardStore());
const uiPorts        = new ChromeUiPorts();
const queue          = new ApprovalQueue(persistentPorts.notifications, new ChromeApprovalPresenter(uiPorts));
const containerCache = new ContainerCache();

async function broadcastEvent(push: ContentPush): Promise<void> {
  const sessions = await persistentPorts.sessionStore.list();
  // A PROVIDER_EVENT may target a single origin (per-origin accountsChanged);
  // everything else fans out to every connected origin.
  const targetOrigin =
    push.type === 'PROVIDER_EVENT' && push.event === 'accountsChanged' ? push.origin : undefined;
  await Promise.all(
    sessions
      .filter(({ origin }) => targetOrigin == null || origin === targetOrigin)
      .map(async ({ origin }) => {
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
  aliasCache,
  containerCache,
  rebuildContainer,
  broadcastEvent,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const source = classifyChromeSender(sender);
  void (async () => {
    sendResponse(await dispatch(msg, source, deps));
    // Stamp after dispatch so an UNLOCK message stamps the fresh session and a
    // LOCK message doesn't resurrect one. dApp traffic is deliberately not
    // activity: a polling page must not hold the wallet open forever.
    if (source?.channel === 'trusted-ui') void recordActivity(autoLockPorts);
  })();
  return true;
});

// ── Auto-lock ─────────────────────────────────────────────────────────────────
// Mirrors the mobile shell's semantics with MV3 means: a wallet-inactivity
// deadline (trusted-UI messages stamp activity, a periodic alarm enforces it —
// chrome.idle alone never fires while the user is active elsewhere in the
// browser), plus immediate lock on system idle / screen lock / SW suspend.
// Locking mirrors the LOCK message handler's effect (keyring + queue + cache).

function autoLock(reason: string): void {
  if (!keyring.isUnlocked()) return;
  keyring.lock();
  queue.rejectAll(reason);
  state.container = null;
  containerCache.clear();
  void broadcastEvent({ type: 'WALLET_ROLE', routesViaRelayer: false });
  console.info('[TezosX Wallet] auto-locked:', reason);
}

const ACTIVITY_KEY = 'lastWalletActivityAt';

const autoLockPorts: AutoLockPorts = {
  isUnlocked: () => keyring.isUnlocked(),
  lock:       autoLock,
  now:        () => Date.now(),
  async loadLastActivity() {
    const data = await chrome.storage.session.get(ACTIVITY_KEY);
    return data[ACTIVITY_KEY] as number | undefined;
  },
  async saveLastActivity(ms) {
    await chrome.storage.session.set({ [ACTIVITY_KEY]: ms });
  },
};

chrome.alarms.create(AUTO_LOCK_ALARM_NAME, { periodInMinutes: AUTO_LOCK_ALARM_PERIOD_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM_NAME) void checkIdleDeadline(autoLockPorts);
});

// chrome.idle reports 'active' | 'idle' | 'locked' after the detection interval
// of no input; anything other than 'active' means the user has stepped away.
chrome.idle.setDetectionInterval(AUTO_LOCK_IDLE_MS / 1000);
chrome.idle.onStateChanged.addListener((idleState) => {
  if (idleState !== 'active') autoLock(`idle:${idleState}`);
});
chrome.runtime.onSuspend.addListener(() => autoLock('suspend'));

chrome.runtime.onInstalled.addListener(() => {
  void persistentPorts.notifications.setPendingCount(0);
  console.info(`[TezosX Wallet] service worker installed, v${__WALLET_VERSION__}`);
});

// The side panel is the default surface: the toolbar click opens it (the
// manifest declares no action.default_popup, which would take precedence).
// Where the sidePanel API is missing, fall back to the classic popup so the
// toolbar click still opens a wallet.
if (chrome.sidePanel != null) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => {
      // With no default_popup in the manifest, a rejected setPanelBehavior
      // would leave the toolbar click bound to nothing — restore the popup.
      console.warn('[TezosX Wallet] sidePanel unavailable:', err);
      void chrome.action.setPopup({ popup: 'popup.html' });
    });
} else {
  void chrome.action.setPopup({ popup: 'popup.html' });
}

console.info('[TezosX Wallet] service worker booted');
