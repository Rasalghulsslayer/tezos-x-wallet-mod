/**
 * EIP-1193 surface types: RequestArguments, ProviderRpcError,
 * ProviderConnectInfo, EIP1193Provider.
 */

import type EventEmitter from 'eventemitter3';

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
