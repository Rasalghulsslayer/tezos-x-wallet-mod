/**
 * EvmActivityFetcher: paginated read of an account's Blockscout transactions.
 * Native transfers and contract calls are reported as runtime='l2'; calls to
 * the NAC precompile (0xff…007) are flagged as runtime='cross-runtime' with
 * direction 'evm-to-tezos' and the destination tz1 decoded from the input.
 *
 * When a `getTokenList` closure is provided, the fetcher also queries
 * Blockscout's `tokentx` endpoint and decodes ERC-20 Transfer events for
 * every registered token, producing ActivityTransferItem entries keyed
 * `l2-erc20:<txHash>:<logIndex>`. Contract-call rows whose target is a
 * registered token AND whose txHash has a decoded Transfer event are
 * suppressed (the Transfer row is the meaningful one).
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
import type { Asset, Erc20Asset } from '../../domain/asset';
import { XTZ_L2_ASSET } from '../../domain/asset';
import type { RegisteredToken } from '../../domain/token';

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

interface BlockscoutTokenTx {
  blockNumber:       string;
  hash:              string;
  from:              string;
  to:                string;
  value:             string;
  contractAddress:   string;
  tokenSymbol?:      string;
  tokenName?:        string;
  tokenDecimal?:     string;
  timeStamp:         string;
  txreceipt_status?: string;
  isError?:          string;
  logIndex?:         string;
}

interface BlockscoutEnvelope<T> {
  message?: string;
  result:   T[] | string;
}

function statusOf(tx: { txreceipt_status?: string; isError?: string }): 'pending' | 'confirmed' | 'failed' {
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
  if (clean.length < 4 * 2 + 2 * 64) return null;
  const lenHex = clean.slice(4 * 2 + 64, 4 * 2 + 128);
  const len    = parseInt(lenHex, 16);
  if (!Number.isFinite(len) || len <= 0 || len > 256) return null;
  const dataHex = clean.slice(4 * 2 + 128, 4 * 2 + 128 + len * 2);
  if (dataHex.length < len * 2) return null;
  let out = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const code = parseInt(dataHex.slice(i, i + 2), 16);
    if (code < 0x20 || code > 0x7e) return null;
    out += String.fromCharCode(code);
  }
  return out;
}

export type GetTokenList = () => Promise<RegisteredToken[]>;

export class EvmActivityFetcher implements ActivityFetcher {
  constructor(
    private readonly blockscoutBase: string = BLOCKSCOUT_API_BASE,
    private readonly getTokenList?: GetTokenList,
  ) {}

  async list(args: { holder: string; limit: number; cursor?: string }): Promise<ActivityFetcherPage> {
    const page = args.cursor != null && args.cursor !== '' ? parseInt(args.cursor, 10) : 1;
    const tokenList = this.getTokenList ? await this.getTokenList() : [];

    const [txRes, tokenRes] = await Promise.all([
      this.fetchTxList(args.holder, page, args.limit),
      tokenList.length > 0
        ? this.fetchTokenTransfers(args.holder, page, args.limit, tokenList)
        : Promise.resolve([] as ActivityTransferItem[]),
    ]);

    // Suppress contract-call rows whose target is a registered token AND whose
    // txHash already appears as a decoded Transfer item — keep the Transfer row.
    const suppressedHashes = new Set(
      tokenRes.map((t) => t.id.split(':')[1]),                   // l2-erc20:<txHash>:<logIndex>
    );
    const tokenAddrs = new Set(tokenList.map((t) => t.address.toLowerCase()));
    const filteredTxItems = txRes.items.filter((item) => {
      if (item.kind !== 'contract-call') return true;
      const isToToken     = tokenAddrs.has(item.target.toLowerCase());
      const txHash        = item.id.split(':')[1];
      return !(isToToken && suppressedHashes.has(txHash));
    });

    const items  = [...filteredTxItems, ...tokenRes];
    const cursor = txRes.cursor;                                  // pagination follows txlist
    return { items, cursor };
  }

  // ── txlist (native + contract calls) ────────────────────────────────────────
  private async fetchTxList(holder: string, page: number, limit: number): Promise<ActivityFetcherPage> {
    const url = `${this.blockscoutBase}?module=account&action=txlist&address=${holder}`
      + `&page=${page}&offset=${limit}&sort=desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
    const envelope = await res.json() as BlockscoutEnvelope<BlockscoutTx>;
    if (!Array.isArray(envelope.result)) {
      throw new Error(`Blockscout: ${envelope.message ?? 'unexpected response'}`);
    }
    const rawTxs = envelope.result;
    const items  = rawTxs.map((tx) => this.toActivityItem(tx, holder));
    const cursor = rawTxs.length === limit ? String(page + 1) : undefined;
    return { items, cursor };
  }

  // ── tokentx (ERC-20 Transfer events filtered by the per-account registry) ─
  private async fetchTokenTransfers(
    holder:    string,
    page:      number,
    limit:     number,
    tokenList: RegisteredToken[],
  ): Promise<ActivityTransferItem[]> {
    const url = `${this.blockscoutBase}?module=account&action=tokentx&address=${holder}`
      + `&page=${page}&offset=${limit}&sort=desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Blockscout tokentx HTTP ${res.status}`);
    const envelope = await res.json() as BlockscoutEnvelope<BlockscoutTokenTx>;
    if (!Array.isArray(envelope.result)) return [];               // rate-limit envelope → silent skip; txlist still works
    const registered = new Map(tokenList.map((t) => [t.address.toLowerCase(), t] as const));
    const out: ActivityTransferItem[] = [];
    for (const entry of envelope.result) {
      const token = registered.get(entry.contractAddress.toLowerCase());
      if (token == null) continue;                                // unregistered token — silently filter
      out.push(this.toErc20TransferItem(entry, holder, token));
    }
    return out;
  }

  private toErc20TransferItem(
    entry:  BlockscoutTokenTx,
    holder: string,
    token:  RegisteredToken,
  ): ActivityTransferItem {
    const holderLc  = holder.toLowerCase();
    const fromLc    = entry.from.toLowerCase();
    const toLc      = entry.to.toLowerCase();
    const direction: 'sent' | 'received' | 'self' =
      fromLc === holderLc && toLc === holderLc ? 'self' :
      fromLc === holderLc                       ? 'sent' :
                                                  'received';
    const counterparty = direction === 'received' ? entry.from : entry.to;
    const asset: Erc20Asset = {
      kind:     'erc20',
      address:  token.address,
      symbol:   token.symbol,
      name:     token.name,
      decimals: token.decimals,
      runtime:  'evm',
    };
    return {
      id:           `l2-erc20:${entry.hash}:${entry.logIndex ?? '0'}`,
      kind:         'transfer',
      direction,
      runtime:      'l2',
      counterparty,
      asset,
      amount:       entry.value || '0',
      timestamp:    parseInt(entry.timeStamp, 10) * 1000,
      status:       statusOf(entry),
      links:        { primary: { explorer: 'blockscout', url: `${EVM_EXPLORER}/tx/${entry.hash}` } },
    };
  }

  // ── native + contract-call projection (unchanged shape; Asset object now) ─
  private toActivityItem(tx: BlockscoutTx, holder: string): ActivityItem {
    const status        = statusOf(tx);
    const timestamp     = parseInt(tx.timeStamp, 10) * 1000;
    const blockscoutUrl = `${EVM_EXPLORER}/tx/${tx.hash}`;
    const holderLc      = holder.toLowerCase();
    const fromLc        = tx.from.toLowerCase();
    const toLc          = tx.to.toLowerCase();

    // ── NAC precompile call (evm-to-tezos cross-runtime) ──────────────────
    if (toLc === NAC_PRECOMPILE_ADDR.toLowerCase()) {
      const dest = decodePrecompileTransferInput(tx.input) ?? '';
      const asset: Asset = XTZ_L2_ASSET;
      const item: ActivityTransferItem = {
        id:           `l2:${tx.hash}`,
        kind:         'transfer',
        direction:    fromLc === holderLc ? 'sent' : 'received',
        runtime:      'cross-runtime',
        counterparty: dest,
        asset,
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
          l1OpHash:        '',
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
        asset:     XTZ_L2_ASSET,
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
