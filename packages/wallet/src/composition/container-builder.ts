/**
 * ensureContainerFor: cache-aware container resolution for an arbitrary
 * account in the unlocked vault. Used by the SW's rebuildContainer (active)
 * and by the EIP-1193 handler (pinned account for a pending approval).
 */

import { buildContainer, type Container, type UnlockedSecrets, type PersistentPorts } from './container';
import type { ContainerCache } from './container-cache';
import type { Keyring } from '../background/keyring';
import type { AccountId, Account } from '../domain/account';
import type { ContentPush } from '../shared/messages';

export interface EnsureContainerDeps {
  keyring:          Keyring;
  containerCache:   ContainerCache;
  persistentPorts:  PersistentPorts;
  onProviderEvent:  (push: ContentPush) => Promise<void>;
}

export async function ensureContainerFor(accountId: AccountId, deps: EnsureContainerDeps): Promise<Container> {
  const cached = deps.containerCache.get(accountId);
  if (cached != null) return cached;

  const { account, secretKey } = await deps.keyring.getSigningKeyFor(accountId);
  const built = buildContainer(toUnlockedSecrets(account, secretKey), deps.persistentPorts);
  attachProviderListeners(built, deps.onProviderEvent);
  deps.containerCache.put(accountId, built);
  return built;
}

function toUnlockedSecrets(account: Account, secretKey: string): UnlockedSecrets {
  if (account.kind === 'tezos') {
    return {
      kind:      'tezos',
      accountId: account.id,
      label:     account.label,
      createdAt: account.createdAt,
      tz1:       account.tz1,
      publicKey: account.publicKey,
      secretKey,
    };
  }
  return {
    kind:       'evm',
    accountId:  account.id,
    label:      account.label,
    createdAt:  account.createdAt,
    address:    account.address,
    publicKey:  account.publicKey,
    privateKey: secretKey,
  };
}

function attachProviderListeners(c: Container, onEvent: (p: ContentPush) => Promise<void>): void {
  c.provider.on('accountsChanged', (accounts: string[]) =>
    void onEvent({ type: 'PROVIDER_EVENT', event: 'accountsChanged', data: accounts }),
  );
  c.provider.on('chainChanged', (chainId: string) =>
    void onEvent({ type: 'PROVIDER_EVENT', event: 'chainChanged', data: chainId }),
  );
  c.provider.on('connect', (info: { chainId: string }) =>
    void onEvent({ type: 'PROVIDER_EVENT', event: 'connect', data: info }),
  );
  c.provider.on('disconnect', (err: { code: number; message: string }) =>
    void onEvent({ type: 'PROVIDER_EVENT', event: 'disconnect', data: { code: err.code, message: err.message } }),
  );
}
