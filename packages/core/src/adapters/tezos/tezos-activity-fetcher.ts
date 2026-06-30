/**
 * TezosActivityFetcher: paginated read of an account's TzKT operations.
 * Returns ActivityItems with runtime='l1'; cross-runtime correlation (against
 * Blockscout's kernel-synthesized mirror) happens in the listActivity use case.
 */

import { TZKT_API_BASE, TEZOS_EXPLORER, EVM_EXPLORER } from '../../shared/constants';
import { NAC_CONTRACT } from '@tezosx/relayer/constants';
import type {
  ActivityFetcher,
  ActivityFetcherPage,
} from '../../ports/activity-fetcher';
import type {
  ActivityItem,
  ActivityContractCallItem,
  ActivityTransferItem,
  ActivityUnknownItem,
} from '../../domain/activity';
import { XTZ_L1_ASSET } from '../../domain/asset';

interface TzktAccountAddress { address: string }

interface TzktOperation {
  type:        string;
  id:          number;
  level:       number;
  timestamp:   string;
  hash:        string;
  sender:      TzktAccountAddress;
  target?:     TzktAccountAddress;
  amount?:     number;
  parameter?:  { entrypoint: string; value: unknown };
  status:      string;
  hasInternals?: boolean;
}

function statusOf(op: TzktOperation): 'pending' | 'confirmed' | 'failed' {
  if (op.status === 'applied')   return 'confirmed';
  if (op.status === 'failed' || op.status === 'backtracked' || op.status === 'skipped') return 'failed';
  return 'pending';
}

function isNacGatewayCall(op: TzktOperation): boolean {
  return op.target?.address === NAC_CONTRACT
      && op.parameter != null
      // `call` is the current bare-transfer / HTTP entrypoint; `call_evm` the ABI
      // call. `default` is the removed legacy bare-transfer helper — still matched
      // so historical operations keep decoding.
      && (op.parameter.entrypoint === 'call'
          || op.parameter.entrypoint === 'call_evm'
          || op.parameter.entrypoint === 'default');
}

/** Recursively find the first runtime URL (http://ethereum/<0x> or http://tezos/<tz1>)
 *  anywhere in a (possibly humanized) TzKT parameter value. */
function findRuntimeUrl(v: unknown): string | null {
  if (typeof v === 'string') return /^https?:\/\/(?:ethereum|tezos)\//.test(v) ? v : null;
  if (Array.isArray(v)) { for (const e of v) { const r = findRuntimeUrl(e); if (r != null) return r; } return null; }
  if (v != null && typeof v === 'object') { for (const e of Object.values(v as object)) { const r = findRuntimeUrl(e); if (r != null) return r; } }
  return null;
}

/** First Micheline/JSON string anywhere in a parameter value. */
function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) { for (const e of v) { const r = firstString(e); if (r != null) return r; } return null; }
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.string === 'string') return o.string;
    for (const e of Object.values(o)) { const r = firstString(e); if (r != null) return r; }
  }
  return null;
}

function counterpartyFromNacCall(op: TzktOperation): string {
  // Legacy `default`: value is the destination 0x string directly.
  // `call` (bare transfer): value is an HTTP request whose url is
  // http://ethereum/<0x> — strip the scheme/host to surface the 0x.
  // `call_evm` (ABI call): value is a Michelson tuple; the destination is the
  // first string field. Best-effort — fall back to '' if we can't decode.
  const v = op.parameter?.value;
  if (typeof v === 'string') return v;
  const url = findRuntimeUrl(v);
  if (url != null) return url.replace(/^https?:\/\/(?:ethereum|tezos)\//, '');
  return firstString(v) ?? '';
}

export class TezosActivityFetcher implements ActivityFetcher {
  constructor(private readonly tzktBase: string = TZKT_API_BASE) {}

  async list(args: { holder: string; limit: number; cursor?: string }): Promise<ActivityFetcherPage> {
    const params = new URLSearchParams({
      limit: String(args.limit),
      type:  'transaction',
      'sort.desc': 'id',
    });
    if (args.cursor != null && args.cursor !== '') {
      params.set('lastId', args.cursor);
    }

    const url = `${this.tzktBase}/v1/accounts/${args.holder}/operations?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TzKT HTTP ${res.status}`);
    const raw = await res.json() as TzktOperation[];

    const items = raw.map((op) => this.toActivityItem(op, args.holder));
    const cursor = raw.length === args.limit ? String(raw[raw.length - 1].id) : undefined;
    return { items, cursor };
  }

  private toActivityItem(op: TzktOperation, holder: string): ActivityItem {
    const status    = statusOf(op);
    const timestamp = new Date(op.timestamp).getTime();
    const tzktUrl   = `${TEZOS_EXPLORER}/${op.hash}`;

    // ── Native transfer (no parameter) ────────────────────────────────────
    if (op.parameter == null) {
      const targetAddr = op.target?.address ?? '';
      const direction: 'sent' | 'received' | 'self' =
        op.sender.address === holder && targetAddr === holder ? 'self' :
        op.sender.address === holder                          ? 'sent' :
                                                                 'received';
      const counterparty = direction === 'received' ? op.sender.address : targetAddr;
      const item: ActivityTransferItem = {
        id:        `l1:${op.id}`,
        kind:      'transfer',
        direction,
        runtime:   'l1',
        counterparty,
        asset:     XTZ_L1_ASSET,
        amount:    String(op.amount ?? 0),
        timestamp,
        status,
        links:     { primary: { explorer: 'tzkt', url: tzktUrl } },
      };
      return item;
    }

    // ── NAC gateway call (cross-runtime tezos-to-evm candidate) ───────────
    if (isNacGatewayCall(op)) {
      const counterparty = counterpartyFromNacCall(op);
      const item: ActivityTransferItem = {
        id:           `l1:${op.id}`,    // remains l1-keyed until the use case dedups
        kind:         'transfer',
        direction:    op.sender.address === holder ? 'sent' : 'received',
        runtime:      'l1',
        counterparty,
        asset:        XTZ_L1_ASSET,
        amount:       String(op.amount ?? 0),
        timestamp,
        status,
        links:        {
          primary:   { explorer: 'tzkt',       url: tzktUrl },
          secondary: { explorer: 'blockscout', url: `${EVM_EXPLORER}/address/${counterparty}` },
        },
        crossRuntime: {
          direction:       'tezos-to-evm',
          l1OpHash:        op.hash,
          evmEffectStatus: 'unresolved',
          tzktOperationId: op.id,
        },
      };
      return item;
    }

    // ── Other contract call ───────────────────────────────────────────────
    const targetAddr = op.target?.address ?? '';
    if (targetAddr.startsWith('KT1') || targetAddr.startsWith('KT2') || targetAddr.startsWith('KT3')) {
      const item: ActivityContractCallItem = {
        id:        `l1:${op.id}`,
        kind:      'contract-call',
        direction: 'sent',
        runtime:   'l1',
        target:    targetAddr,
        methodSig: op.parameter.entrypoint,
        timestamp,
        status,
        links:     { primary: { explorer: 'tzkt', url: tzktUrl } },
      };
      return item;
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    const unknown: ActivityUnknownItem = {
      id:        `l1:${op.id}`,
      kind:      'unknown',
      runtime:   'l1',
      timestamp,
      links:     { primary: { explorer: 'tzkt', url: tzktUrl } },
      raw:       { source: 'tzkt', ref: op.hash },
    };
    return unknown;
  }
}
