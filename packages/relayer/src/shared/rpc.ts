/**
 * JSON-RPC 2.0 fetch helper used for both the Tezlink EVM endpoint and the
 * Michelson runtime endpoint.
 */

import type { ProviderRpcError } from '../domain/eip-1193.js';

// EIP-1193 transport-loss code: the provider could not reach the chain.
const EIP1193_DISCONNECTED = 4900;

function makeRpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  const err = new Error(message) as ProviderRpcError;
  (err as { code: number }).code = code;
  if (data !== undefined) (err as { data: unknown }).data = data;
  return err;
}

export async function jsonRpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch (err) {
    throw makeRpcError(EIP1193_DISCONNECTED, `Network error calling ${method}: ${String(err)}`);
  }

  if (!res.ok) {
    throw makeRpcError(EIP1193_DISCONNECTED, `HTTP ${res.status} from ${url} (${method})`);
  }

  const json = (await res.json()) as {
    result?: T;
    error?: { code: number; message: string; data?: unknown };
  };

  if (json.error != null) {
    throw makeRpcError(json.error.code, json.error.message, json.error.data);
  }

  return json.result as T;
}
