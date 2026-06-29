/**
 * RuntimeId: 'michelson' | 'evm' (canonical runtime identifier).
 * DestRuntime: 'l1' | 'l2' | null (wallet UI-facing alias derived from
 * the address shape).
 * ChainConfig: runtime + chainId + rpcUrl.
 */

export type RuntimeId = 'michelson' | 'evm';

export type DestRuntime = 'l1' | 'l2' | null;

export interface ChainConfig {
  runtime: RuntimeId;
  chainId: string;
  rpcUrl:  string;
}
