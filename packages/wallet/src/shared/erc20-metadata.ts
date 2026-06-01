/**
 * fetchErc20Metadata: reads symbol() / decimals() / name() from an ERC-20
 * contract via eth_call. Handles both string-encoded and bytes32-encoded
 * symbol/name (the old MakerDAO pattern). decimals() rejection or a 0x
 * response throws NotErc20Error; symbol/name fall back gracefully.
 */

import { NotErc20Error, type TokenMetadata } from '../domain/token';
import { shortAddr } from './format';
import { TOKEN_METADATA_TIMEOUT_MS } from './constants';

const SELECTOR_SYMBOL   = '0x95d89b41';
const SELECTOR_DECIMALS = '0x313ce567';
const SELECTOR_NAME     = '0x06fdde03';

export async function fetchErc20Metadata(address: string, rpcUrl: string): Promise<TokenMetadata> {
  const calls: Promise<string>[] = [
    withTimeout(ethCall(rpcUrl, address, SELECTOR_SYMBOL),   TOKEN_METADATA_TIMEOUT_MS),
    withTimeout(ethCall(rpcUrl, address, SELECTOR_DECIMALS), TOKEN_METADATA_TIMEOUT_MS),
    withTimeout(ethCall(rpcUrl, address, SELECTOR_NAME),     TOKEN_METADATA_TIMEOUT_MS),
  ];
  const [symRes, decRes, nameRes] = await Promise.allSettled(calls);

  // decimals() is load-bearing — a contract that doesn't respond isn't an ERC-20.
  if (decRes.status === 'rejected' || isEmptyHex(decRes.value)) {
    throw new NotErc20Error(address);
  }
  const decimals = parseUint8(decRes.value);

  const fallbackSymbol = shortAddr(address);
  const symbol = symRes.status === 'fulfilled' && !isEmptyHex(symRes.value)
    ? (decodeStringOrBytes32(symRes.value) ?? fallbackSymbol)
    : fallbackSymbol;

  const name = nameRes.status === 'fulfilled' && !isEmptyHex(nameRes.value)
    ? (decodeStringOrBytes32(nameRes.value) ?? symbol)
    : symbol;

  return { symbol, name, decimals };
}

// ── JSON-RPC eth_call ─────────────────────────────────────────────────────────

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const res = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`eth_call HTTP ${res.status}`);
  const json = await res.json() as { result?: string; error?: { message: string } };
  if (json.error != null) throw new Error(`eth_call ${data}: ${json.error.message}`);
  if (typeof json.result !== 'string') throw new Error('eth_call returned non-string');
  return json.result;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ── Decoders ──────────────────────────────────────────────────────────────────

function isEmptyHex(hex: string): boolean {
  return hex === '0x' || hex === '0x0' || /^0x0+$/.test(hex);
}

/**
 * decimals() returns a uint8 in a 32-byte big-endian word. Anything > 255 is
 * non-standard (a 256-decimal token is nonsense) and treated as a parse error.
 */
function parseUint8(hex: string): number {
  if (!hex.startsWith('0x')) throw new Error('decimals: not a hex string');
  const n = BigInt(hex);
  if (n < 0n || n > 255n) throw new Error(`decimals: out of range (${n})`);
  return Number(n);
}

/**
 * symbol() / name() may return either an ABI-encoded `string` (dynamic — offset
 * 0x20, then length, then bytes) or a raw `bytes32` (old MakerDAO tokens).
 * Tries dynamic-string first, falls back to bytes32. Returns null if neither
 * produces a printable result.
 */
function decodeStringOrBytes32(hex: string): string | null {
  const dyn = tryDecodeDynamicString(hex);
  if (dyn != null && isPrintable(dyn)) return dyn;
  const b32 = tryDecodeBytes32(hex);
  if (b32 != null && isPrintable(b32)) return b32;
  return null;
}

function tryDecodeDynamicString(hex: string): string | null {
  if (!hex.startsWith('0x')) return null;
  const raw = hex.slice(2);
  if (raw.length < 64 * 2) return null;             // need at least offset + length

  // Offset (first 32 bytes) should be 0x20 (decimal 32) for a single-string return.
  const offsetHex = raw.slice(0, 64);
  const offset    = Number(BigInt('0x' + offsetHex));
  if (offset !== 32) return null;

  const lengthHex = raw.slice(64, 128);
  const length    = Number(BigInt('0x' + lengthHex));
  if (length === 0 || length > 256) return null;    // sanity cap on string length

  const dataHex   = raw.slice(128, 128 + length * 2);
  if (dataHex.length < length * 2) return null;

  try {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function tryDecodeBytes32(hex: string): string | null {
  if (!hex.startsWith('0x')) return null;
  const raw = hex.slice(2);
  if (raw.length !== 64) return null;               // exactly 32 bytes

  // Strip trailing 0x00 padding bytes, then UTF-8 decode.
  let end = 32;
  while (end > 0 && raw.slice((end - 1) * 2, end * 2) === '00') end--;
  if (end === 0) return null;

  try {
    const bytes = new Uint8Array(end);
    for (let i = 0; i < end; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function isPrintable(s: string): boolean {
  if (s.length === 0) return false;
  // Allow ASCII printable + common Unicode (letters, digits, punctuation, symbol marks).
  // Reject strings that are mostly control characters.
  // eslint-disable-next-line no-control-regex
  return !/[\x00-\x08\x0e-\x1f\x7f]/.test(s);
}
