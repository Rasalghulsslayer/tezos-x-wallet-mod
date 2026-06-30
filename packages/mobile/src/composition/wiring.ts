/**
 * Mobile composition root — the equivalent of the extension service worker's
 * adapter wiring, minus a buildContainer (the unlock+balances milestone is
 * read-only and needs no signer/provider Container). Constructs the @noble
 * CryptoPort, the MMKV-backed persistent ports, the Keychain unlock-secret
 * store, and the Keyring. A single MMKV instance backs vault/sessions/tokens;
 * the unlock secret lives separately in the Keychain behind biometrics.
 */

import { createMMKV } from 'react-native-mmkv';
import { Keyring } from '@tezosx/wallet-core/keyring';
import { NobleCryptoPort } from '../adapters/noble-crypto-port';
import { MmkvVaultStore } from '../adapters/mmkv-vault-store';
import { MmkvSessionStore } from '../adapters/mmkv-session-store';
import { MmkvTokenStore } from '../adapters/mmkv-token-store';
import { NoopNotificationPort } from '../adapters/noop-notification-port';
import { KeychainUnlockSecret } from '../adapters/keychain-unlock-secret';

const mmkv = createMMKV({ id: 'tezosx-wallet' });

export const cryptoPort    = new NobleCryptoPort();
export const vaultStore    = new MmkvVaultStore(mmkv);
export const sessionStore  = new MmkvSessionStore(mmkv);
export const tokenStore    = new MmkvTokenStore(mmkv);
export const notifications = new NoopNotificationPort();
export const unlockSecret  = new KeychainUnlockSecret();

export const keyring = new Keyring(vaultStore, cryptoPort);

/** Mutable holder for the resolved EVM alias, mirroring the SW's evmAliasCache
 *  (getState fills it on the first unlocked read). Cleared on lock. */
export const evmAliasCache: { value: string | null } = { value: null };
