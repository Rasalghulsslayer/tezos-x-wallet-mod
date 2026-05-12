import { TEZLINK_EVM_RPC } from './shared/constants.js';
import { jsonRpc } from './shared/rpc.js';
import type { EthTransactionReceipt } from './types.js';

/**
 * Minimal shape of a block returned by eth_getBlockByNumber(..., true).
 * Only includes the fields we actually read.
 */
export interface EvmBlock {
  number:       string;
  transactions: EvmTxSummary[];
}

export interface EvmTxSummary {
  hash:        string;
  from:        string;
  to:          string | null;
  blockNumber: string;
}

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

  /** Returns the current head block number as a 0x-prefixed hex string. */
  async blockNumber(): Promise<string> {
    return jsonRpc<string>(this.rpcUrl, 'eth_blockNumber');
  }

  /**
   * Returns an EVM block with full transaction objects (or null if not yet
   * mined). `blockNumber` must be 0x-prefixed hex or a tag ('latest', etc.).
   */
  async getBlockByNumber(blockNumber: string, withTxs = true): Promise<EvmBlock | null> {
    return jsonRpc<EvmBlock | null>(
      this.rpcUrl,
      'eth_getBlockByNumber',
      [blockNumber, withTxs],
    );
  }

  /**
   * Forward any JSON-RPC method to the Tezlink EVM node.
   * Used as a catch-all for methods not explicitly handled by the relayer
   * (e.g. eth_blockNumber, eth_getBlockByNumber, eth_gasPrice, eth_estimateGas,
   * eth_getCode, eth_getLogs, etc.).
   */
  async proxy(method: string, params: unknown[] = []): Promise<unknown> {
    return jsonRpc<unknown>(this.rpcUrl, method, params);
  }
}
