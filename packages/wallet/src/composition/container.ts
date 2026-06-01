/**
 * buildContainer: factory wiring the concrete adapters that match the
 * active account's kind. persistentPorts holds the chrome.storage- and
 * chrome.action-backed singletons that exist whether the wallet is locked
 * or unlocked.
 */

import { RelayerProvider } from '@tezosx/relayer/provider';
import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import type { PendingOpView } from '@tezosx/relayer/tezos';
import { TezosSigner } from '../adapters/tezos/tezos-signer';
import { TezosBalanceFetcher } from '../adapters/tezos/tezos-balance-fetcher';
import { TezosActivityFetcher } from '../adapters/tezos/tezos-activity-fetcher';
import { EvmSigner } from '../adapters/evm/evm-signer';
import { EvmProvider } from '../adapters/evm/evm-provider';
import { EvmBalanceFetcher } from '../adapters/evm/evm-balance-fetcher';
import { EvmActivityFetcher } from '../adapters/evm/evm-activity-fetcher';
import { ChromeVaultStore } from '../adapters/chrome/chrome-vault-store';
import { ChromeSessionStore } from '../adapters/chrome/chrome-session-store';
import { ChromeNotificationPort } from '../adapters/chrome/chrome-notification';
import type { SignerPort } from '../ports/signer-port';
import type { ProviderPort } from '../ports/provider-port';
import type { BalanceFetcher } from '../ports/balance-fetcher';
import type { ActivityFetcher } from '../ports/activity-fetcher';
import type { VaultStore } from '../ports/vault-store';
import type { SessionStore } from '../ports/session-store';
import type { NotificationPort } from '../ports/notification-port';
import type { TokenStore } from '../ports/token-store';
import { ChromeTokenStore } from '../adapters/chrome/chrome-token-store';
import type { TezosAccount, EvmAccount, AccountId } from '../domain/account';

export type UnlockedSecrets =
  | {
      kind:       'tezos';
      tz1:        string;
      publicKey:  string;
      secretKey:  string;
      accountId:  AccountId;
      label?:     string;
      createdAt:  number;
    }
  | {
      kind:       'evm';
      address:    `0x${string}`;
      publicKey:  `0x${string}`;
      privateKey: string;
      accountId:  AccountId;
      label?:     string;
      createdAt:  number;
    };

export interface ActivitySources {
  tezos?:       ActivityFetcher;                              // Tezos accounts only
  evm:          ActivityFetcher;                              // always populated
  pendingOps?:  () => readonly PendingOpView[];               // Tezos accounts only (via RelayerProvider)
}

export interface Container {
  signer:           SignerPort;
  provider:         ProviderPort;
  balanceFetcher:   BalanceFetcher;
  activitySources:  ActivitySources;
  vaultStore:       VaultStore;
  sessionStore:     SessionStore;
  tokenStore:       TokenStore;
  notifications:    NotificationPort;
}

export interface PersistentPorts {
  vaultStore:    VaultStore;
  sessionStore:  SessionStore;
  tokenStore:    TokenStore;
  notifications: NotificationPort;
}

const vaultStore:    VaultStore       = new ChromeVaultStore();
const sessionStore:  SessionStore     = new ChromeSessionStore();
const tokenStore:    TokenStore       = new ChromeTokenStore();
const notifications: NotificationPort = new ChromeNotificationPort();

export const persistentPorts: PersistentPorts = { vaultStore, sessionStore, tokenStore, notifications };

export function buildContainer(secrets: UnlockedSecrets): Container {
  if (secrets.kind === 'tezos') {
    const account: TezosAccount = {
      kind:      'tezos',
      id:        secrets.accountId,
      label:     secrets.label,
      tz1:       secrets.tz1,
      publicKey: secrets.publicKey,
      createdAt: secrets.createdAt,
    };
    const signer   = new TezosSigner(account, secrets.secretKey);
    const provider = new RelayerProvider(signer);
    return {
      signer,
      provider,
      balanceFetcher:  new TezosBalanceFetcher(),
      activitySources: {
        tezos:       new TezosActivityFetcher(),
        evm:         new EvmActivityFetcher(),
        pendingOps:  () => provider.listPendingOps(),
      },
      vaultStore, sessionStore, tokenStore, notifications,
    };
  }

  const account: EvmAccount = {
    kind:      'evm',
    id:        secrets.accountId,
    label:     secrets.label,
    address:   secrets.address,
    publicKey: secrets.publicKey,
    createdAt: secrets.createdAt,
  };
  const signer   = new EvmSigner(account, secrets.privateKey);
  const provider = new EvmProvider(signer, TEZLINK_EVM_RPC);
  return {
    signer,
    provider,
    balanceFetcher:  new EvmBalanceFetcher(),
    activitySources: { evm: new EvmActivityFetcher() },
    vaultStore, sessionStore, tokenStore, notifications,
  };
}
