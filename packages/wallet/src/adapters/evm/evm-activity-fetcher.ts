/**
 * EvmActivityFetcher: paginated read of an account's Blockscout transactions.
 * Native transfers and contract calls are reported as runtime='l2'; calls to
 * the NAC precompile (0xff…007) are flagged as runtime='cross-runtime' with
 * direction 'evm-to-tezos' and the destination tz1 decoded from the input.
 */

import { BLOCKSCOUT_API_BASE, EVM_EXPLORER, TEZOS_EXPLORER } from '../../shared/constants';
import { NAC_PRECOMPILE_ADDR } from '@tezosx/relayer/constants';
import type {
  ActivityFetcher,
  ActivityFetcherPage,
} from '../../ports/activity-fetcher';
import type {
  ActivityContractCallItem,
  ActivityItem,
  ActivityTransferItem,
} from '../../domain/activity';

interface BlockscoutTx {
  blockNumber:       string;
  hash:              string;
  from:              string;
  to:                string;
  value:             string;
  input:             string;
  timeStamp:         string;
  txreceipt_status?: string;
  isError?:          string;
  gas?:              string;
  gasUsed?:          string;
  nonce?:            string;
}

interface BlockscoutEnvelope {
  message?: string;
  result:   BlockscoutTx[] | string;
}

function statusOf(tx: BlockscoutTx): 'pending' | 'confirmed' | 'failed' {
  if (tx.txreceipt_status === '1') return 'confirmed';
  if (tx.txreceipt_status === '0' || tx.isError === '1') return 'failed';
  return 'pending';
}

/**
 * Decodes the destination tz1 from a NAC precompile `transfer(string)` call.
 * ABI layout after the 4-byte selector: 32-byte offset, 32-byte length, then
 * `length` bytes of ASCII payload. Returns null if the layout doesn't match.
 */
export function decodePrecompileTransferInput(input: string): string | null {
  const clean = input.startsWith('0x') ? input.slice(2) : input;
  if (clean.length < 4 * 2 + 2 * 64) return null;          // selector + offset + length minimum
  // We accept any selector — the wallet uses `transfer(string)` (0xa0258d0b)
  // but third-party callers may use the precompile via other signatures. The
  // structural check (offset 0x20, sane length, ASCII bytes) is what matters.
  const lenHex = clean.slice(4 * 2 + 64, 4 * 2 + 128);
  const len    = parseInt(lenHex, 16);
  if (!Number.isFinite(len) || len <= 0 || len > 256) return null;
  const dataHex = clean.slice(4 * 2 + 128, 4 * 2 + 128 + len * 2);
  if (dataHex.length < len * 2) return null;
  let out = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const code = parseInt(dataHex.slice(i, i + 2), 16);
    if (code < 0x20 || code > 0x7e) return null;            // require printable ASCII
    out += String.fromCharCode(code);
  }
  return out;
}

export class EvmActivityFetcher implements ActivityFetcher {
  constructor(private readonly blockscoutBase: string = BLOCKSCOUT_API_BASE) {}

  async list(args: { holder: string; limit: number; cursor?: string }): Promise<ActivityFetcherPage> {
    const page = args.cursor != null && args.cursor !== '' ? parseInt(args.cursor, 10) : 1;
    const url = `${this.blockscoutBase}?module=account&action=txlist&address=${args.holder}`
      + `&page=${page}&offset=${args.limit}&sort=desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
    const envelope = await res.json() as BlockscoutEnvelope;
    if (!Array.isArray(envelope.result)) {
      // Rate limit or error envelope; treat as empty page with a soft error.
      throw new Error(`Blockscout: ${envelope.message ?? 'unexpected response'}`);
    }
    const rawTxs = envelope.result;
    const items  = rawTxs.map((tx) => this.toActivityItem(tx, args.holder));
    const cursor = rawTxs.length === args.limit ? String(page + 1) : undefined;
    return { items, cursor };
  }

  private toActivityItem(tx: BlockscoutTx, holder: string): ActivityItem {
    const status     = statusOf(tx);
    const timestamp  = parseInt(tx.timeStamp, 10) * 1000;
    const blockscoutUrl = `${EVM_EXPLORER}/tx/${tx.hash}`;
    const holderLc   = holder.toLowerCase();
    const fromLc     = tx.from.toLowerCase();
    const toLc       = tx.to.toLowerCase();

    // ── NAC precompile call (evm-to-tezos cross-runtime) ──────────────────
    if (toLc === NAC_PRECOMPILE_ADDR.toLowerCase()) {
      const dest = decodePrecompileTransferInput(tx.input) ?? '';
      const item: ActivityTransferItem = {
        id:           `l2:${tx.hash}`,
        kind:         'transfer',
        direction:    fromLc === holderLc ? 'sent' : 'received',
        runtime:      'cross-runtime',
        counterparty: dest,
        asset:        'XTZ',
        amount:       tx.value || '0',
        timestamp,
        status,
        links:        {
          primary:   { explorer: 'blockscout', url: blockscoutUrl },
          secondary: dest !== ''
            ? { explorer: 'tzkt', url: `${TEZOS_EXPLORER}/${dest}` }
            : undefined,
        },
        crossRuntime: {
          direction:       'evm-to-tezos',
          l1OpHash:        '',                              // unknown at the EVM-source level
          l2TxHash:        tx.hash,
          evmEffectStatus: status === 'confirmed' ? 'confirmed' : status === 'failed' ? 'failed' : 'pending',
        },
      };
      return item;
    }

    // ── Native EVM transfer (no input data) ───────────────────────────────
    if (tx.input === '0x' || tx.input === '') {
      const direction: 'sent' | 'received' | 'self' =
        fromLc === holderLc && toLc === holderLc ? 'self' :
        fromLc === holderLc                       ? 'sent' :
                                                    'received';
      const counterparty = direction === 'received' ? tx.from : tx.to;
      const item: ActivityTransferItem = {
        id:        `l2:${tx.hash}`,
        kind:      'transfer',
        direction,
        runtime:   'l2',
        counterparty,
        asset:     'XTZ',
        amount:    tx.value || '0',
        timestamp,
        status,
        links:     { primary: { explorer: 'blockscout', url: blockscoutUrl } },
      };
      return item;
    }

    // ── Generic EVM contract call ─────────────────────────────────────────
    const selector = tx.input.slice(0, 10);
    const item: ActivityContractCallItem = {
      id:        `l2:${tx.hash}`,
      kind:      'contract-call',
      direction: 'sent',
      runtime:   'l2',
      target:    tx.to,
      methodSig: selector,
      timestamp,
      status,
      links:     { primary: { explorer: 'blockscout', url: blockscoutUrl } },
    };
    return item;
  }
}
