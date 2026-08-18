/**
 * JSON-RPC 2.0 fetch helper used for both the Tezlink EVM endpoint and the
 * Michelson runtime endpoint.
 */

import type { ProviderRpcError } from '../domain/eip-1193.js';
import { RPC_TIMEOUT_MS } from './constants.js';

// EIP-1193 transport-loss code: the provider could not reach the chain.
const EIP1193_DISCONNECTED = 4900;

function makeRpcError(code: number, message: string, data?: unknown): ProviderRpcError {
  const err = new Error(message) as ProviderRpcError;
  (err as { code: number }).code = code;
  if (data !== undefined) (err as { data: unknown }).data = data;
  return err;
}

export interface JsonRpcOptions {
  /** Deadline for the HTTP round-trip. Defaults to RPC_TIMEOUT_MS; pass null
   *  to disable — reserved for calls that may legitimately be slow AND have
   *  already committed side effects (write passthroughs), where an abort
   *  after broadcast is worse than waiting. */
  timeoutMs?: number | null;
}

export async function jsonRpc<T>(
  url: string,
  method: string,
  params: unknown[] = [],
  opts: JsonRpcOptions = {},
): Promise<T> {
  const timeoutMs  = opts.timeoutMs === undefined ? RPC_TIMEOUT_MS : opts.timeoutMs;
  const controller = timeoutMs != null ? new AbortController() : null;
  const timer      = controller != null ? setTimeout(() => controller.abort(), timeoutMs as number) : null;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller?.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted) {
      // No EIP-1193 code on purpose: a timeout is not a transport loss, and
      // the "timed out" message routes to the dedicated error copy.
      throw new Error(`Request timed out after ${timeoutMs}ms calling ${method}`);
    }
    throw makeRpcError(EIP1193_DISCONNECTED, `Network error calling ${method}: ${String(err)}`);
  } finally {
    if (timer != null) clearTimeout(timer);
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
