/**
 * findRealHash: scan EVM blocks starting at fromBlock to find the kernel-
 * synthesized transaction bound to the sender's alias for an outgoing
 * `eth_sendTransaction` cross-runtime request.
 *
 * The kernel produces one of two shapes:
 *
 *  - **Sender-side synthesis** (the common case): the synthesized tx is
 *    *from* the alias (`tx.from = senderAlias`). The destination, value,
 *    and calldata mirror the dApp's original request. Matched directly.
 *
 *  - **Inbound bookkeeping** (AliasForwarder, contract calls routed through
 *    L1, etc.): the synthesized tx is *to* the alias (`tx.to = senderAlias`)
 *    and the receipt carries a log emitted by the NAC precompile. Matching
 *    on `to = senderAlias` alone is too permissive — unrelated bookkeeping
 *    txs share that shape — so the matcher checks the receipt for a
 *    NAC_PRECOMPILE_ADDR log before claiming.
 *
 * Per-block candidates are sorted by nonce ascending so concurrent syntheses
 * claim their txs in submission order.
 */

import type { TezlinkClient } from '../tezos/tezlink.js';
import { NAC_PRECOMPILE_ADDR } from '../shared/constants.js';
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

  const senderCandidates = block.transactions
    .filter((tx) => !claimedHashes.has(tx.hash) && tx.from.toLowerCase() === target.senderAlias)
    .sort((a, b) => parseNonce(a.nonce) - parseNonce(b.nonce));

  if (senderCandidates.length > 0) {
    const match = senderCandidates[0];
    claimedHashes.add(match.hash);
    return match.hash;
  }

  const inboundCandidates = block.transactions
    .filter((tx) => !claimedHashes.has(tx.hash) && tx.to?.toLowerCase() === target.senderAlias)
    .sort((a, b) => parseNonce(a.nonce) - parseNonce(b.nonce));

  for (const tx of inboundCandidates) {
    if (await hasNacPrecompileLog(tezlink, tx.hash)) {
      claimedHashes.add(tx.hash);
      return tx.hash;
    }
  }

  return null;
}

function parseNonce(hex: string | undefined): number {
  if (hex == null) return Number.MAX_SAFE_INTEGER;
  const n = parseInt(hex, 16);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

async function hasNacPrecompileLog(tezlink: TezlinkClient, txHash: string): Promise<boolean> {
  const receipt = await tezlink.getTransactionReceipt(txHash);
  return Boolean(
    receipt?.logs.some(
      (log): log is { address: string } =>
        typeof log === 'object' &&
        log !== null &&
        'address' in log &&
        typeof (log as { address?: unknown }).address === 'string' &&
        (log as { address: string }).address.toLowerCase() === NAC_PRECOMPILE_ADDR,
    ),
  );
}
