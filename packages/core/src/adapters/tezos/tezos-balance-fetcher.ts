/**
 * Balance reads against TzKT and the Tezlink EVM RPC. Exports the three
 * legacy helper functions consumed directly by the UI and a port-compliant
 * TezosBalanceFetcher class for use cases that need a typed BalanceFetcher.
 */

import { TezlinkClient } from '@tezosx/relayer/tezlink';
import { TEZOS_L1_RPC } from '@tezosx/relayer/constants';
import type { BalanceFetcher } from '../../ports/balance-fetcher';
import type { Asset } from '../../domain/asset';
import { fetchWithDeadline } from '../../shared/fetch-with-deadline';
import { RPC_READ_TIMEOUT_MS } from '../../shared/constants';

const tezlink = new TezlinkClient();

const BALANCE_OF_SELECTOR = '0x70a08231';

function encodeAddressParam(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

export async function fetchL1XtzBalance(tz1: string): Promise<string> {
  const res = await fetchWithDeadline(
    `${TEZOS_L1_RPC}/chains/main/blocks/head/context/contracts/${tz1}/balance`,
    undefined,
    RPC_READ_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`L1 RPC ${res.status}: ${await res.text()}`);
  return (await res.json()) as string;
}

export async function fetchXtzBalance(evmAddr: string): Promise<string> {
  return tezlink.getBalance(evmAddr);
}

export async function fetchErc20Balance(token: string, holder: string): Promise<string> {
  return tezlink.call(
    { to: token, data: BALANCE_OF_SELECTOR + encodeAddressParam(holder) },
    'latest',
  );
}

export class TezosBalanceFetcher implements BalanceFetcher {
  /**
   * `holder` is interpreted based on `asset.runtime`:
   *   - asset.kind === 'xtz' with runtime 'michelson' → tz1, hits TzKT for mutez balance
   *   - asset.kind === 'erc20' (always 'evm' runtime) → 0x EVM alias of the tz1
   */
  async balanceOf(holder: string, asset: Asset): Promise<bigint> {
    if (asset.kind === 'xtz') {
      const mutez = await fetchL1XtzBalance(holder);
      return BigInt(mutez);
    }
    const hex = await fetchErc20Balance(asset.address, holder);
    return BigInt(hex);
  }
}
