import type { ProviderRpcError } from '../types.js';

const JSON_RPC_INTERNAL = -32603;

function makeRpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  const err = new Error(message) as ProviderRpcError;
  (err as { code: number }).code = code;
  if (data !== undefined) (err as { data: unknown }).data = data;
  return err;
}

/**
 * Generic JSON-RPC 2.0 fetch helper.
 * Works for both the EVM endpoint (TEZLINK_EVM_RPC) and the Michelson runtime endpoint (TEZOS_L1_RPC) —
 * both use the same JSON-RPC 2.0 wire format.
 */
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
    throw makeRpcError(JSON_RPC_INTERNAL, `Network error calling ${method}: ${String(err)}`);
  }

  if (!res.ok) {
    throw makeRpcError(JSON_RPC_INTERNAL, `HTTP ${res.status} from ${url} (${method})`);
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
