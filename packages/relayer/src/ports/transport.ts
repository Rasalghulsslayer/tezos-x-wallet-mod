/**
 * JsonRpcTransport: a minimal JSON-RPC 2.0 channel.
 * TransportPort: pair of channels — one for the Tezlink EVM endpoint and
 * one for the Michelson runtime Octez node.
 */

export interface JsonRpcTransport {
  call<T>(method: string, params?: unknown[]): Promise<T>;
}

export interface TransportPort {
  evmRpc:     JsonRpcTransport;
  tezosL1Rpc: JsonRpcTransport;
}
