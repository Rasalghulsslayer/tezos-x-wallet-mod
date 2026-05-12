import type EventEmitter from 'eventemitter3';

// ── EIP-1193 core types ────────────────────────────────────────────────────

export interface RequestArguments {
  readonly method: string;
  readonly params?: readonly unknown[];
}

export interface ProviderRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
}

export interface ProviderConnectInfo {
  readonly chainId: string;
}

export interface EIP1193Provider extends EventEmitter {
  request(args: RequestArguments): Promise<unknown>;
  on(event: 'connect',         listener: (info: ProviderConnectInfo) => void): this;
  on(event: 'disconnect',      listener: (error: ProviderRpcError) => void): this;
  on(event: 'accountsChanged', listener: (accounts: string[]) => void): this;
  on(event: 'chainChanged',    listener: (chainId: string) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string,            listener: (...args: any[]) => void): this;
}

// ── Ethereum transaction types ─────────────────────────────────────────────

export interface EthTransactionRequest {
  from?:     string;
  to:        string;
  data?:     string;     // hex calldata (0x-prefixed)
  value?:    string;     // hex wei (0x-prefixed)
  gas?:      string;
  gasPrice?: string;
}

export interface EthTransactionReceipt {
  transactionHash:    string;
  transactionIndex:   string;
  blockHash:          string;
  blockNumber:        string;
  from:               string;
  to:                 string | null;
  contractAddress:    string | null;
  cumulativeGasUsed:  string;
  gasUsed:            string;
  effectiveGasPrice:  string;
  logs:               unknown[];
  logsBloom:          string;
  status:             string;   // '0x1' success | '0x0' failure
  type:               string;
}

// ── Relayer internal types ─────────────────────────────────────────────────

export interface RelayerSession {
  tz1Address: string;
  evmAlias:   string;
  chainId:    string;
}

export interface PendingOp {
  l1OpHash:  string;
  from:      string;    // EVM alias of the sender
  to:        string;    // destination address (informational)
  fromBlock: string;    // 0x-prefixed hex: EVM block number at send time
  realHash?: string;    // cached real EVM tx hash once resolved
}

// ── Beacon narrowed types ──────────────────────────────────────────────────

export interface BeaconPermissions {
  address:   string;   // tz1...
  publicKey: string;
}

// ── Domain & ports re-exports ──────────────────────────────────────────────

export * from './domain/index.js';
export * from './ports/index.js';
