/**
 * buildContainer: factory wiring the concrete adapters that match the active
 * account's kind. The platform-specific persistent ports (vault / session /
 * token / notification) are injected by the host shell — the extension service
 * worker passes its chrome.* adapters — so this module stays free of any
 * platform coupling and can be shared with a future mobile shell.
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
import type { SignerPort } from '@tezosx/wallet-core/ports/signer-port';
import type { ProviderPort } from '@tezosx/wallet-core/ports/provider-port';
import type { BalanceFetcher } from '@tezosx/wallet-core/ports/balance-fetcher';
import type { ActivityFetcher } from '@tezosx/wallet-core/ports/activity-fetcher';
import type { VaultStore } from '@tezosx/wallet-core/ports/vault-store';
import type { SessionStore } from '@tezosx/wallet-core/ports/session-store';
import type { NotificationPort } from '@tezosx/wallet-core/ports/notification-port';
import type { TokenStore } from '@tezosx/wallet-core/ports/token-store';
import type { TezosAccount, EvmAccount, AccountId } from '@tezosx/wallet-core/domain/account';

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

export function buildContainer(secrets: UnlockedSecrets, ports: PersistentPorts): Container {
  const { vaultStore, sessionStore, tokenStore, notifications } = ports;
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
    const tokenList = () => tokenStore.list(account.id);
    return {
      signer,
      provider,
      balanceFetcher:  new TezosBalanceFetcher(),
      activitySources: {
        tezos:       new TezosActivityFetcher(),
        evm:         new EvmActivityFetcher(undefined, tokenList),
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
  const signer    = new EvmSigner(account, secrets.privateKey);
  const provider  = new EvmProvider(signer, TEZLINK_EVM_RPC);
  const tokenList = () => tokenStore.list(account.id);
  return {
    signer,
    provider,
    balanceFetcher:  new EvmBalanceFetcher(),
    activitySources: { evm: new EvmActivityFetcher(undefined, tokenList) },
    vaultStore, sessionStore, tokenStore, notifications,
  };
}
