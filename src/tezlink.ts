import { TEZLINK_EVM_RPC } from './constants.js';
import { jsonRpc } from './utils/rpc.js';
import type { EthTransactionReceipt } from './types.js';

export class TezlinkClient {
  private readonly rpcUrl: string;

  constructor(rpcUrl: string = TEZLINK_EVM_RPC) {
    this.rpcUrl = rpcUrl;
  }

  /** Returns the EVM chain ID as a 0x-prefixed hex string (e.g. '0x1f094'). */
  async getChainId(): Promise<string> {
    return jsonRpc<string>(this.rpcUrl, 'eth_chainId');
  }

  /** Returns the balance of an EVM address as a 0x-prefixed hex wei string. */
  async getBalance(address: string, block = 'latest'): Promise<string> {
    return jsonRpc<string>(this.rpcUrl, 'eth_getBalance', [address, block]);
  }

  /**
   * Returns the transaction receipt for a given EVM tx hash, or null if not
   * yet mined / not found. The Tezlink node may or may not index operations
   * initiated via the NAC gateway — use buildSyntheticReceipt as fallback.
   */
  async getTransactionReceipt(txHash: string): Promise<EthTransactionReceipt | null> {
    return jsonRpc<EthTransactionReceipt | null>(
      this.rpcUrl,
      'eth_getTransactionReceipt',
      [txHash],
    );
  }

  /** Executes a read-only call against an EVM contract. */
  async call(tx: Record<string, string>, block = 'latest'): Promise<string> {
    return jsonRpc<string>(this.rpcUrl, 'eth_call', [tx, block]);
  }

  /** Returns the transaction count (nonce) for an address. */
  async getTransactionCount(address: string, block = 'latest'): Promise<string> {
    return jsonRpc<string>(this.rpcUrl, 'eth_getTransactionCount', [address, block]);
  }
}
