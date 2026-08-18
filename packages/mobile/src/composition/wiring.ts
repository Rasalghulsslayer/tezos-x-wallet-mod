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
import { EvmAliasCache } from '@tezosx/wallet-core/shared/evm-alias-cache';
import type { PersistentPorts } from '@tezosx/wallet-core/ports/container';
import type { ContentPush } from '@tezosx/wallet-core/shared/messages';
import { QuickCryptoPort } from '../adapters/quick-crypto-port';
import { MmkvVaultStore } from '../adapters/mmkv-vault-store';
import { MmkvSessionStore } from '../adapters/mmkv-session-store';
import { MmkvTokenStore } from '../adapters/mmkv-token-store';
import { MmkvContactStore } from '../adapters/mmkv-contact-store';
import { MmkvAliasStore } from '../adapters/mmkv-alias-store';
import { MmkvSnapshotStore } from '../adapters/mmkv-snapshot-store';
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
export const aliasStore    = new MmkvAliasStore(mmkv);
export const snapshotStore = new MmkvSnapshotStore(mmkv);
export const notifications = new NoopNotificationPort();
export const unlockSecret  = new KeychainUnlockSecret();

export const keyring = new Keyring(vaultStore, cryptoPort, new MmkvUnlockGuardStore(mmkv));

/** tz1 → EVM alias entries, mirroring the extension SW's cache. Backed by the
 *  MMKV alias store: resolved entries are written through and hydrated back
 *  after an app restart, so an alias is resolved at most once per wallet
 *  lifetime. Survives lock — aliases are immutable public mappings, not key
 *  material — and is cleared (with its persisted map) on wallet reset. */
export const evmAliasCache = new EvmAliasCache(aliasStore);
// Warm the cache from storage at module init. Race-safe: hydrate() is
// idempotent and backfill() awaits it internally before resolving anything.
void evmAliasCache.hydrate();

// ── dApp routing composition (SwDeps) ─────────────────────────────────────────
// The same shape the extension service worker builds, so the WalletConnect
// transport drives the shared core `dispatch`. The presenter shows an in-app
// modal; broadcastEvent fans provider events out to connected dApps over WC.

export const persistentPorts: PersistentPorts = {
  vaultStore,
  sessionStore,
  tokenStore,
  contactStore: new MmkvContactStore(mmkv),
  aliasStore,
  snapshotStore,
  notifications,
  pendingOpsStore: (accountId) => new MmkvPendingOpsStore(mmkv, accountId),
};

export const approvalPresenter = new MobileApprovalPresenter();
export const approvalQueue     = new ApprovalQueue(notifications, approvalPresenter);
const containerCache           = new ContainerCache();

const state: SwState = { container: null };

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
  aliasCache: evmAliasCache,
  containerCache,
  rebuildContainer,
  broadcastEvent,
};
