/**
 * EvmProvider: EIP-1193 provider for EVM-native accounts. Speaks JSON-RPC
 * to the Tezlink EVM endpoint, signs eth_sendTransaction locally via the
 * EvmSigner, and proxies every other method as a thin pass-through.
 */

import EventEmitter from 'eventemitter3';
import type {
  EIP1193Provider,
  RequestArguments,
  ProviderRpcError,
} from '@tezosx/relayer/types';
import type { EvmSigner } from './evm-signer';

const JSON_RPC_INVALID_PARAMS = -32602;

function rpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  const err = new Error(message) as ProviderRpcError;
  (err as { code: number }).code = code;
  if (data !== undefined) (err as { data: unknown }).data = data;
  return err;
}

export class EvmProvider extends EventEmitter implements EIP1193Provider {
  readonly isMetaMask = false;
  readonly isTezosXRelayer = true;

  private chainId: string | null = null;

  constructor(
    private readonly signer:    EvmSigner,
    private readonly evmRpcUrl: string,
  ) {
    super();
  }

  async request(args: RequestArguments): Promise<unknown> {
    switch (args.method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [this.signer.account.address];

      case 'eth_chainId':
        if (this.chainId == null) {
          this.chainId = await this.jsonRpc<string>('eth_chainId');
        }
        return this.chainId;

      case 'net_version': {
        const chainId = await this.request({ method: 'eth_chainId' }) as string;
        return String(parseInt(chainId, 16));
      }

      case 'eth_sendTransaction':
        return this.handleSendTransaction(args);

      case 'personal_sign': {
        const params  = args.params as [string, string];
        const message = params[0];
        return this.signer.signPersonalMessage(message);
      }

      default:
        return this.jsonRpc(args.method, Array.isArray(args.params) ? args.params : []);
    }
  }

  /** No-op for EVM-native accounts (no synthetic NAC hash to resolve). */
  async resolveSyntheticHash(_syntheticHash: string): Promise<string | null> {
    return null;
  }

  private async handleSendTransaction(args: RequestArguments): Promise<string> {
    const params = args.params;
    if (!Array.isArray(params) || params.length === 0) {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_sendTransaction: missing params');
    }
    const tx = params[0] as { to?: string; value?: string; data?: string; gas?: string };
    if (typeof tx.to !== 'string') {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_sendTransaction: missing "to"');
    }

    const fromAddress = this.signer.account.address;
    const [chainIdHex, nonceHex, gasPriceHex] = await Promise.all([
      this.jsonRpc<string>('eth_chainId'),
      this.jsonRpc<string>('eth_getTransactionCount', [fromAddress, 'latest']),
      this.jsonRpc<string>('eth_gasPrice').catch(() => '0x0'),
    ]);

    const rawSigned = await this.signer.signEvmTx({
      to:                   tx.to as `0x${string}`,
      data:                 (tx.data ?? '0x') as `0x${string}`,
      value:                BigInt(tx.value ?? '0x0'),
      gasLimit:             BigInt(tx.gas   ?? '0x1e8480'),  // 2M default
      nonce:                BigInt(nonceHex),
      chainId:              BigInt(chainIdHex),
      maxFeePerGas:         BigInt(gasPriceHex),
      maxPriorityFeePerGas: 0n,
    });

    return this.jsonRpc<string>('eth_sendRawTransaction', [rawSigned]);
  }

  private async jsonRpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.evmRpcUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as {
      result?: T;
      error?: { code: number; message: string; data?: unknown };
    };
    if (json.error != null) {
      throw rpcError(json.error.code, json.error.message, json.error.data);
    }
    return json.result as T;
  }
}
