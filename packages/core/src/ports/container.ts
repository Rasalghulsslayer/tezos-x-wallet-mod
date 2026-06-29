/**
 * Container: the fully-wired set of ports a use case operates on for the active
 * account. It is the seam between the use cases (which consume this shape) and
 * the composition root (which builds it by wiring the concrete adapters that
 * match the account's kind). The factory that constructs it lives in the host
 * shell — only the contract lives here, so use cases stay platform-neutral.
 */

import type { PendingOpView } from '@tezosx/relayer/tezos';
import type { SignerPort } from './signer-port';
import type { ProviderPort } from './provider-port';
import type { BalanceFetcher } from './balance-fetcher';
import type { ActivityFetcher } from './activity-fetcher';
import type { VaultStore } from './vault-store';
import type { SessionStore } from './session-store';
import type { NotificationPort } from './notification-port';
import type { TokenStore } from './token-store';
import type { CrossRuntimeBuilderPort } from './cross-runtime-builder';
import type { AccountId } from '../domain/account';

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
  signer:             SignerPort;
  provider:           ProviderPort;
  balanceFetcher:     BalanceFetcher;
  activitySources:    ActivitySources;
  crossRuntimeBuilder: CrossRuntimeBuilderPort;  // EVM → tz1/KT1 via NAC precompile (used by EVM-source sends)
  vaultStore:         VaultStore;
  sessionStore:       SessionStore;
  tokenStore:         TokenStore;
  notifications:      NotificationPort;
}

export interface PersistentPorts {
  vaultStore:    VaultStore;
  sessionStore:  SessionStore;
  tokenStore:    TokenStore;
  notifications: NotificationPort;
}
