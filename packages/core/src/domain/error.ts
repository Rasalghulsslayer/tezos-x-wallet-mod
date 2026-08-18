/**
 * FormattedError, KNOWN_ERRORS catalog, makeError constructor, and the
 * formatError dispatcher routing raw errors to the right family handler.
 */

import { mutezToXtz } from '../shared/format';

export interface FormattedError {
  title:  string;
  detail: string;
  raw:    string;
  /** Slug-cased machine code for support tickets / fatal screen footer. */
  code?:  string;
}

interface RpcPayload {
  kind?:     string;
  id?:       string;
  contract?: string;
  balance?:  string;
  amount?:   string;
  required?: string;
  current?:  string;
  method?:   string;
}

type Handler = (e: RpcPayload) => Pick<FormattedError, 'title' | 'detail'>;

const KNOWN_ERRORS: Record<string, Handler> = {
  // ── Tezos RPC ──────────────────────────────────────────────────────────
  'contract.balance_too_low': (e) => ({
    title:  'Insufficient funds',
    detail: `Tried to spend ${mutezToXtz(e.amount ?? '0')} ꜩ but balance is ${mutezToXtz(e.balance ?? '0')} ꜩ.`,
  }),
  'contract.counter_in_the_past': () => ({
    title:  'Operation already submitted',
    detail: 'A previous operation from this account is still being processed. Wait a few seconds and retry.',
  }),
  'gas_exhausted.operation': () => ({
    title:  'Operation ran out of gas',
    detail: 'The operation reached its gas limit before completion. The wallet will retry with a higher limit.',
  }),
  'tezlink_error': () => ({
    title:  'Cross-runtime call failed',
    detail: 'The NAC gateway rejected the call. Verify the destination contract and entrypoint.',
  }),
  'evm_node.dev.insufficient_fees': (e) => ({
    title:  'Network fee too low',
    detail: `Required ${e.required ?? '?'} ꜩ but only ${e.current ?? '?'} ꜩ provided. The wallet should auto-retry with the correct value.`,
  }),

  // ── Auth ───────────────────────────────────────────────────────────────
  'invalid-mnemonic': () => ({
    title:  'Invalid recovery phrase',
    detail: "The 12 or 24 words don't form a valid BIP-39 phrase. Check spelling and word order.",
  }),
  'invalid-edsk': () => ({
    title:  'Invalid Tezos secret key',
    detail: 'Expected a 54-character or 98-character key starting with edsk…',
  }),
  'password-too-short': () => ({
    title:  'Password too short',
    detail: 'Use at least 8 characters.',
  }),
  'wrong-password': () => ({
    title:  'Incorrect password',
    detail: 'Try again, or restore from your recovery phrase.',
  }),
  'no-vault': () => ({
    title:  'No wallet found',
    detail: 'Create a new wallet or import an existing one to continue.',
  }),

  // ── EIP-1193 ───────────────────────────────────────────────────────────
  'eip1193:4001': () => ({
    title:  'Request rejected',
    detail: 'You declined the request from the dApp.',
  }),
  'eip1193:4100': () => ({
    title:  'Wallet locked',
    detail: 'Unlock your wallet to continue.',
  }),
  'eip1193:4200': (e) => ({
    title:  'Method not supported',
    detail: `${e.method ?? 'This method'} isn't available on the Tezos X relayer.`,
  }),
  // 4900 (disconnected): the relayer's rpc helper attaches it to any fetch
  // failure, so this is the code-based route to the network copy.
  'eip1193:4900': () => ({
    title:  'Network unreachable',
    detail: "The Tezos X RPC didn't respond. Check your connection or try again.",
  }),
  'eip1193:-32601': () => ({
    title:  'Unknown method',
    detail: "The dApp called a method the wallet doesn't recognize.",
  }),
  'eip1193:-32602': () => ({
    title:  'Invalid parameters',
    detail: 'The dApp sent malformed arguments. Check the dApp implementation.',
  }),
  'eip1193:-32603': () => ({
    title:  'Internal error',
    detail: 'Something failed inside the wallet. See technical details.',
  }),

  // ── Network ────────────────────────────────────────────────────────────
  'rpc-unreachable': () => ({
    title:  'Network unreachable',
    detail: "The Tezos X RPC didn't respond. Check your connection or try again.",
  }),
  'rpc-timeout': () => ({
    title:  'Request timed out',
    detail: 'The node took too long to respond. The operation may still go through.',
  }),
  'rpc-5xx': () => ({
    title:  'Network error',
    detail: 'The Tezos X RPC returned an error. Try again in a moment.',
  }),

  // ── App-level ──────────────────────────────────────────────────────────
  'sw-unreachable': () => ({
    title:  "Wallet can't reach its service worker",
    detail: "A reload usually fixes this. Your keys and history aren't affected — they're stored locally and untouched.",
  }),
  'iframe-blocked': () => ({
    title:  'This window cannot be embedded',
    detail: 'Open the wallet from the extension toolbar instead.',
  }),
};

const PROTO_PREFIX_RE = /^proto\.[^.]+\./;

function fromKey(key: string, raw: string, payload: RpcPayload = {}): FormattedError {
  const handler = KNOWN_ERRORS[key];
  if (!handler) {
    return { title: 'Operation failed', detail: raw, raw, code: key };
  }
  return { ...handler(payload), raw, code: key };
}

export function makeError(key: string, ctx?: RpcPayload): FormattedError {
  return fromKey(key, key, ctx ?? {});
}

function parseTezosRpc(raw: string): FormattedError | null {
  const jsonMatch = raw.match(/\[\s*\{[\s\S]+\}\s*\]/);
  if (!jsonMatch) return null;
  try {
    const errs = JSON.parse(jsonMatch[0]) as RpcPayload[];
    for (const e of errs) {
      const id       = e.id ?? '';
      const stripped = id.replace(PROTO_PREFIX_RE, '');
      if (KNOWN_ERRORS[stripped]) return fromKey(stripped, raw, e);
      if (KNOWN_ERRORS[id])       return fromKey(id,       raw, e);
    }
    const firstId = errs[0]?.id;
    if (firstId) {
      return {
        title:  'Operation rejected',
        detail: `The node rejected the operation (${firstId.replace(PROTO_PREFIX_RE, '')}).`,
        raw,
        code:   firstId,
      };
    }
  } catch { /* fallthrough */ }
  return null;
}

/**
 * True when the failure is about the credential itself (wrong password,
 * unlock throttle, missing vault) — the only cases where a login form should
 * clear the password field. A network or internal failure must keep the
 * user's typing: wiping it there reads as "wrong password".
 */
export function isAuthError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /Incorrect password|bad decrypt|Too many attempts|No wallet found/i.test(raw);
}

export function formatError(err: unknown, ctx?: { method?: string }): FormattedError {
  if (typeof err === 'object' && err !== null && 'title' in err && 'detail' in err) {
    return err as FormattedError;
  }

  const raw = err instanceof Error ? err.message : String(err);

  if (/Invalid BIP39 mnemonic|invalid recovery phrase/i.test(raw)) return fromKey('invalid-mnemonic', raw);
  if (/Invalid Tezos secret key|invalid edsk/i.test(raw))           return fromKey('invalid-edsk', raw);
  if (/Password must be at least|password too short/i.test(raw))    return fromKey('password-too-short', raw);
  if (/Incorrect password|bad decrypt|decrypt/i.test(raw))          return fromKey('wrong-password', raw);
  if (/No wallet found|no vault/i.test(raw))                        return fromKey('no-vault', raw);

  const code = (err as { code?: number })?.code;
  if (typeof code === 'number') {
    const key = `eip1193:${code}`;
    if (KNOWN_ERRORS[key]) return fromKey(key, raw, ctx ?? {});
  }

  // "Network request failed" is React Native's fetch failure string — the RN
  // shell never produces "Failed to fetch".
  if (/Failed to fetch|Network request failed|NetworkError|ECONNREFUSED|TypeError.*fetch/i.test(raw)) return fromKey('rpc-unreachable', raw);
  if (/timeout|aborted/i.test(raw))                                            return fromKey('rpc-timeout',     raw);
  if (/^L1 RPC 5\d\d|EVM RPC 5\d\d|HTTP 5\d\d/i.test(raw))                     return fromKey('rpc-5xx',         raw);

  const tezos = parseTezosRpc(raw);
  if (tezos) return tezos;

  return {
    title:  'Operation failed',
    detail: raw.length > 140 ? `${raw.slice(0, 137)}…` : raw,
    raw,
  };
}
