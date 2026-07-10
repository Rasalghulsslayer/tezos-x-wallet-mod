/**
 * Mobile composition root — the equivalent of the extension service worker's
 * adapter wiring, minus a buildContainer (the unlock+balances milestone is
 * read-only and needs no signer/provider Container). Constructs the native
 * (react-native-quick-crypto) CryptoPort, the MMKV-backed persistent ports, the Keychain unlock-secret
 * store, and the Keyring. A single MMKV instance backs vault/sessions/tokens;
 * the unlock secret lives separately in the Keychain behind biometrics.
 */

import { createMMKV } from 'react-native-mmkv';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { ApprovalQueue } from '@tezosx/wallet-core/approval-queue';
import { ContainerCache } from '@tezosx/wallet-core/composition/container-cache';
import { ensureContainerFor } from '@tezosx/wallet-core/composition/container-builder';
import type { SwState, SwDeps } from '@tezosx/wallet-core/composition/sw-wiring';
import type { PersistentPorts } from '@tezosx/wallet-core/ports/container';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
import { QuickCryptoPort } from '../adapters/quick-crypto-port';
import { MmkvVaultStore } from '../adapters/mmkv-vault-store';
import { MmkvSessionStore } from '../adapters/mmkv-session-store';
import { MmkvTokenStore } from '../adapters/mmkv-token-store';
import { MmkvUnlockGuardStore } from '../adapters/mmkv-unlock-guard-store';
import { MmkvPendingOpsStore } from '../adapters/mmkv-pending-ops-store';
import { NoopNotificationPort } from '../adapters/noop-notification-port';
import { KeychainUnlockSecret } from '../adapters/keychain-unlock-secret';
import { MobileApprovalPresenter } from '../adapters/mobile-approval-presenter';
import { emitProviderEvent } from '../transport/walletconnect';

const mmkv = createMMKV({ id: 'tezosx-wallet' });

export const cryptoPort    = new QuickCryptoPort();
export const vaultStore    = new MmkvVaultStore(mmkv);
export const sessionStore  = new MmkvSessionStore(mmkv);
export const tokenStore    = new MmkvTokenStore(mmkv);
export const notifications = new NoopNotificationPort();
export const unlockSecret  = new KeychainUnlockSecret();

export const keyring = new Keyring(vaultStore, cryptoPort, new MmkvUnlockGuardStore(mmkv));

/** Mutable holder for the resolved EVM alias, mirroring the SW's evmAliasCache
 *  (getState fills it on the first unlocked read). Cleared on lock. */
export const evmAliasCache: { value: string | null } = { value: null };

// ── dApp routing composition (SwDeps) ─────────────────────────────────────────
// The same shape the extension service worker builds, so the WalletConnect
// transport drives the shared core `dispatch`. The presenter shows an in-app
// modal; broadcastEvent fans provider events out to connected dApps over WC.

export const persistentPorts: PersistentPorts = {
  vaultStore,
  sessionStore,
  tokenStore,
  notifications,
  pendingOpsStore: (accountId) => new MmkvPendingOpsStore(mmkv, accountId),
};

export const approvalPresenter = new MobileApprovalPresenter();
export const approvalQueue     = new ApprovalQueue(notifications, approvalPresenter);
const containerCache           = new ContainerCache();

const state: SwState = { container: null, evmAlias: null };

async function broadcastEvent(push: ContentPush): Promise<void> {
  await emitProviderEvent(push);
}

/** Rebuild the active account's Container (used after unlock / account switch).
 *  The connect flow itself doesn't depend on this — dispatch ensures a pinned
 *  container per request — but it keeps state.container warm for read paths. */
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
    persistentPorts,
    onProviderEvent: broadcastEvent,
  });
}

export const deps: SwDeps = {
  keyring,
  approvalQueue,
  persistentPorts,
  state,
  containerCache,
  rebuildContainer,
  broadcastEvent,
};
