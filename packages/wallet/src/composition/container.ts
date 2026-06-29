/**
 * buildContainer: factory wiring the concrete adapters that match the active
 * account's kind. The platform-specific persistent ports (vault / session /
 * token / notification) are injected by the host shell — the extension service
 * worker passes its chrome.* adapters — so this module stays free of any
 * platform coupling and can be shared with a future mobile shell.
 */

import { RelayerProvider } from '@tezosx/relayer/provider';
import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import { TezosSigner } from '../adapters/tezos/tezos-signer';
import { TezosBalanceFetcher } from '../adapters/tezos/tezos-balance-fetcher';
import { TezosActivityFetcher } from '../adapters/tezos/tezos-activity-fetcher';
import { EvmSigner } from '../adapters/evm/evm-signer';
import { EvmProvider } from '../adapters/evm/evm-provider';
import { EvmBalanceFetcher } from '../adapters/evm/evm-balance-fetcher';
import { EvmActivityFetcher } from '../adapters/evm/evm-activity-fetcher';
import { buildEvmToTezosTx } from '../adapters/evm/nac-precompile-builder';
import type { TezosAccount, EvmAccount } from '@tezosx/wallet-core/domain/account';
import type { Container, UnlockedSecrets, PersistentPorts } from '@tezosx/wallet-core/ports/container';

// The cross-runtime builder is stateless and account-agnostic — the same wrapper
// serves both account kinds (only EVM-source sends actually invoke it).
const crossRuntimeBuilder = { buildEvmToTezosTx };

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
      crossRuntimeBuilder,
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
    crossRuntimeBuilder,
    vaultStore, sessionStore, tokenStore, notifications,
  };
}
