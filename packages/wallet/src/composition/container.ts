/**
 * buildContainer: factory wiring the concrete adapters for an unlocked
 * Tezos session. persistentPorts holds the chrome.storage- and chrome.action-
 * backed singletons that exist whether the wallet is locked or unlocked.
 */

import { RelayerProvider } from '@tezosx/relayer/provider';
import { TezosSigner } from '../adapters/tezos/tezos-signer';
import { ChromeVaultStore } from '../adapters/chrome/chrome-vault-store';
import { ChromeSessionStore } from '../adapters/chrome/chrome-session-store';
import { ChromeNotificationPort } from '../adapters/chrome/chrome-notification';
import type { TezosSignerPort } from '../ports/signer-port';
import type { VaultStore } from '../ports/vault-store';
import type { SessionStore } from '../ports/session-store';
import type { NotificationPort } from '../ports/notification-port';

export interface UnlockedSecrets {
  tz1:       string;
  publicKey: string;
  secretKey: string;
}

export interface Container {
  signer:        TezosSignerPort;
  provider:      RelayerProvider;
  vaultStore:    VaultStore;
  sessionStore:  SessionStore;
  notifications: NotificationPort;
}

const vaultStore:    VaultStore       = new ChromeVaultStore();
const sessionStore:  SessionStore     = new ChromeSessionStore();
const notifications: NotificationPort = new ChromeNotificationPort();

export const persistentPorts = { vaultStore, sessionStore, notifications };

export function buildContainer(secrets: UnlockedSecrets): Container {
  const signer   = new TezosSigner(secrets.secretKey, secrets.publicKey, secrets.tz1);
  const provider = new RelayerProvider(signer);
  return {
    signer,
    provider,
    vaultStore,
    sessionStore,
    notifications,
  };
}
