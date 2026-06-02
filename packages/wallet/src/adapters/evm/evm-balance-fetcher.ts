/**
 * EvmBalanceFetcher: balance reads for an EVM-native account via the
 * Tezlink EVM RPC. XTZ via eth_getBalance; ERC-20 via eth_call to
 * balanceOf(holder) at the token contract address.
 */

import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import type { BalanceFetcher } from '../../ports/balance-fetcher';
import type { Asset } from '../../domain/asset';

const BALANCE_OF_SELECTOR = '0x70a08231';

function encodeAddressParam(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function jsonRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(TEZLINK_EVM_RPC, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result?: T; error?: { message: string } };
  if (json.error != null) throw new Error(json.error.message);
  return json.result as T;
}

export class EvmBalanceFetcher implements BalanceFetcher {
  async balanceOf(holder: string, asset: Asset): Promise<bigint> {
    if (asset.kind === 'xtz') {
      const hex = await jsonRpc<string>('eth_getBalance', [holder, 'latest']);
      return BigInt(hex);
    }
    const hex = await jsonRpc<string>('eth_call', [
      { to: asset.address, data: BALANCE_OF_SELECTOR + encodeAddressParam(holder) },
      'latest',
    ]);
    return BigInt(hex);
  }
}
