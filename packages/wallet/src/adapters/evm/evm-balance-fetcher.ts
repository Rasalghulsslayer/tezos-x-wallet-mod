/**
 * EvmBalanceFetcher: balance reads for an EVM-native account via the
 * Tezlink EVM RPC. Native XTZ via eth_getBalance, ERC-20 (USDC) via
 * eth_call to balanceOf(address).
 */

import { TEZLINK_EVM_RPC } from '@tezosx/relayer/constants';
import type { BalanceFetcher } from '../../ports/balance-fetcher';
import type { AssetId } from '../../domain/asset';
import { USDC_CONTRACT } from '../../shared/constants';

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
  async balanceOf(holder: string, asset: AssetId): Promise<bigint> {
    if (asset === 'XTZ') {
      const hex = await jsonRpc<string>('eth_getBalance', [holder, 'latest']);
      return BigInt(hex);
    }
    if (asset === 'USDC') {
      const hex = await jsonRpc<string>('eth_call', [
        { to: USDC_CONTRACT, data: BALANCE_OF_SELECTOR + encodeAddressParam(holder) },
        'latest',
      ]);
      return BigInt(hex);
    }
    throw new Error(`Unsupported asset for EvmBalanceFetcher: ${asset}`);
  }
}
