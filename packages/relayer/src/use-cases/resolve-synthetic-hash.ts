/**
 * findRealHash: scan EVM blocks starting at fromBlock to find the kernel-
 * synthesized transaction matching the original `eth_sendTransaction`
 * request.
 *
 * The kernel produces one of two shapes depending on the destination:
 *
 *  - **Real EVM destination** — the synthesized tx has `to = destination`,
 *    `value = original wei`. Direct match.
 *
 *  - **Encoded-KT1 / alias destination** — the kernel routes the value via
 *    L1 (AliasForwarder, contract call, etc.) and synthesizes an EVM
 *    bookkeeping tx with `to = sender's alias` (a trace of the cross-runtime
 *    op rather than a transfer).
 *
 * The matcher accepts either: `tx.to ∈ {destination, senderAlias}` AND
 * `tx.value = expected`. Per-block candidates are sorted by nonce ascending
 * so concurrent syntheses claim their txs in submission order.
 */

import type { TezlinkClient } from '../tezos/tezlink.js';
import { hexToNum, numToHex } from '../shared/hex.js';
import { sleep } from '../shared/async.js';

export interface FindRealHashTarget {
  /** Destination from the user's `eth_sendTransaction.params[0].to`. */
  to:           string;
  /** 0x-prefixed wei value. */
  value:        string;
  /** Sender's EVM alias. Accepted as an alternate `tx.to` match when the
   *  kernel emits a bookkeeping tx instead of a direct transfer (encoded-KT1
   *  or alias destinations). */
  senderAlias:  string;
}

export async function findRealHash(
  tezlink:       TezlinkClient,
  target:        FindRealHashTarget,
  fromBlock:     string,
  claimedHashes: Set<string>,
  maxAttempts = 15,
  intervalMs  = 2000,
): Promise<string | null> {
  return attemptFind(
    tezlink,
    hexToNum(fromBlock),
    {
      to:          target.to.toLowerCase(),
      value:       normaliseHex(target.value),
      senderAlias: target.senderAlias.toLowerCase(),
    },
    claimedHashes,
    maxAttempts,
    intervalMs,
  );
}

function normaliseHex(hex: string): string {
  // strip leading zeros after 0x so '0x08ac…' and '0x008ac…' compare equal
  const body = hex.replace(/^0x/i, '').replace(/^0+/, '');
  return '0x' + (body.length === 0 ? '0' : body.toLowerCase());
}

interface NormalisedTarget {
  to:          string;
  value:       string;
  senderAlias: string;
}

async function attemptFind(
  tezlink:       TezlinkClient,
  startBlock:    number,
  target:        NormalisedTarget,
  claimedHashes: Set<string>,
  attemptsLeft:  number,
  intervalMs:    number,
): Promise<string | null> {
  if (attemptsLeft <= 0) return null;

  const headBlock = hexToNum(await tezlink.blockNumber());
  const found = await scanRange(tezlink, startBlock, headBlock, target, claimedHashes);
  if (found !== null) return found;

  await sleep(intervalMs);
  return attemptFind(tezlink, startBlock, target, claimedHashes, attemptsLeft - 1, intervalMs);
}

async function scanRange(
  tezlink:       TezlinkClient,
  from:          number,
  to:            number,
  target:        NormalisedTarget,
  claimedHashes: Set<string>,
): Promise<string | null> {
  if (from > to) return null;

  const found = await scanBlock(tezlink, from, target, claimedHashes);
  return found ?? scanRange(tezlink, from + 1, to, target, claimedHashes);
}

async function scanBlock(
  tezlink:       TezlinkClient,
  blockNum:      number,
  target:        NormalisedTarget,
  claimedHashes: Set<string>,
): Promise<string | null> {
  const block = await tezlink.getBlockByNumber(numToHex(blockNum), true);
  if (block === null || block.transactions.length === 0) return null;

  const candidates = block.transactions
    .filter((tx) => {
      if (claimedHashes.has(tx.hash)) return false;
      if (normaliseHex(tx.value ?? '0x0') !== target.value) return false;
      const recipient = (tx.to ?? '').toLowerCase();
      return recipient === target.to || recipient === target.senderAlias;
    })
    .sort((a, b) => parseNonce(a.nonce) - parseNonce(b.nonce));
  if (candidates.length === 0) return null;

  const match = candidates[0];
  claimedHashes.add(match.hash);
  return match.hash;
}

function parseNonce(hex: string | undefined): number {
  if (hex == null) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}
