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
import { devLog } from '../../shared/log';
import { normalizePersonalSignMessage } from '../../shared/evm-signing/index';

const JSON_RPC_INVALID_PARAMS = -32602;
const EIP1193_UNSUPPORTED_METHOD = 4200;

/**
 * Signing methods this provider does not implement locally. They must never
 * reach the remote node — it holds no key and would answer misleadingly — and
 * `eth_sign` is unguarded blind signing we refuse outright. Rejecting them with
 * the EIP-1193 unsupported-method code gives the dApp a clear, correct signal.
 */
const REJECTED_SIGN_METHODS = new Set([
  'eth_sign',
  'eth_signTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
]);

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

  /** Local pending-nonce counter. Lazy-seeded from `'latest'` on first send,
   *  advanced on success, reset to null on failure (next send re-syncs). */
  private pendingNonce: bigint | null = null;

  /** FIFO chain so concurrent `eth_sendTransaction` calls serialise. */
  private sendChain: Promise<unknown> = Promise.resolve();

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
        return BigInt(chainId).toString();
      }

      case 'eth_sendTransaction': {
        // Serialise concurrent sends per provider instance so two dApp calls
        // don't read the same nonce from chain and collide.
        const next = this.sendChain.then(() => this.handleSendTransaction(args));
        this.sendChain = next.catch(() => {});
        return next;
      }

      case 'personal_sign': {
        const params  = args.params as [string, string];
        // EIP-191: params[0] is hex-encoded bytes — decode before signing so
        // the signed bytes match what the approval UI displays (#17).
        const message = normalizePersonalSignMessage(params[0]);
        return this.signer.signPersonalMessage(message);
      }

      default:
        if (REJECTED_SIGN_METHODS.has(args.method)) {
          throw rpcError(EIP1193_UNSUPPORTED_METHOD, `${args.method} is not supported`);
        }
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
    const [chainIdHex, gasPriceHex] = await Promise.all([
      this.jsonRpc<string>('eth_chainId').catch(() => undefined),
      this.jsonRpc<string>('eth_gasPrice').catch(() => undefined),
    ]);

    if (chainIdHex == null) {
      throw rpcError(JSON_RPC_INVALID_PARAMS, 'eth_sendTransaction: eth_chainId returned no result');
    }

    // Seed the local counter from chain on first use; otherwise use the
    // already-incremented value so back-to-back sends get sequential nonces.
    if (this.pendingNonce == null) {
      const nonceHex = await this.jsonRpc<string>('eth_getTransactionCount', [fromAddress, 'latest']).catch(() => undefined);
      this.pendingNonce = BigInt(nonceHex ?? '0x0');
    }
    const nonce = this.pendingNonce;

    const gasPrice  = BigInt(gasPriceHex ?? '0x3b9aca00');  // 1 gwei fallback
    const maxFeePerGas = gasPrice * 2n;

    const txParams = {
      to:                   tx.to as `0x${string}`,
      data:                 (tx.data ?? '0x') as `0x${string}`,
      value:                BigInt(tx.value ?? '0x0'),
      gasLimit:             BigInt(tx.gas   ?? '0x1e8480'),  // 2M default
      nonce,
      chainId:              BigInt(chainIdHex),
      maxFeePerGas,
      maxPriorityFeePerGas: 0n,
    };

    try {
      const rawSigned = await this.signer.signEvmTx(txParams);

      devLog.info('[EvmProvider] eth_sendTransaction signing',
        { from: fromAddress, to: txParams.to, value: '0x'+txParams.value.toString(16),
          nonce: '0x'+txParams.nonce.toString(16), chainId: '0x'+txParams.chainId.toString(16),
          gasLimit: '0x'+txParams.gasLimit.toString(16),
          maxFeePerGas: '0x'+maxFeePerGas.toString(16) });
      devLog.info('[EvmProvider] rawSigned', rawSigned);

      const txHash = await this.jsonRpc<string>('eth_sendRawTransaction', [rawSigned]);
      devLog.info('[EvmProvider] eth_sendRawTransaction returned', txHash);

      this.pendingNonce = nonce + 1n;
      return txHash;
    } catch (err) {
      // Drop the local counter so the next send re-syncs from chain — covers
      // dropped broadcasts, restarted nodes, or txs sent from another wallet.
      this.pendingNonce = null;
      throw err;
    }
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
