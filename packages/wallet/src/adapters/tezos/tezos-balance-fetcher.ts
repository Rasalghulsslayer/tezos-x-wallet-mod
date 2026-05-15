/**
 * Balance reads against TzKT and the Tezlink EVM RPC. Exports the three
 * legacy helper functions consumed directly by the UI and a port-compliant
 * TezosBalanceFetcher class for use cases that need a typed BalanceFetcher.
 */

import { TezlinkClient } from '@tezosx/relayer/tezlink';
import { TEZOS_L1_RPC } from '@tezosx/relayer/constants';
import type { BalanceFetcher } from '../../ports/balance-fetcher';
import type { AssetId } from '../../domain/asset';
import { USDC_CONTRACT } from '../../shared/constants';

const tezlink = new TezlinkClient();

const BALANCE_OF_SELECTOR = '0x70a08231';

function encodeAddressParam(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

export async function fetchL1XtzBalance(tz1: string): Promise<string> {
  const res = await fetch(`${TEZOS_L1_RPC}/chains/main/blocks/head/context/contracts/${tz1}/balance`);
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
  async balanceOf(holder: string, asset: AssetId): Promise<bigint> {
    if (asset === 'XTZ') {
      const mutez = await fetchL1XtzBalance(holder);
      return BigInt(mutez);
    }
    if (asset === 'USDC') {
      const hex = await fetchErc20Balance(USDC_CONTRACT, holder);
      return BigInt(hex);
    }
    throw new Error(`Unsupported asset for TezosBalanceFetcher: ${asset}`);
  }
}
