/**
 * findRealHash: scan EVM blocks starting at fromBlock to find the kernel-
 * synthesized transaction whose `from` matches the alias and that has not
 * been claimed yet. Per-block candidates are sorted by nonce ascending so
 * concurrent syntheses claim their txs in submission order.
 */

import type { TezlinkClient } from '../tezos/tezlink.js';
import { hexToNum, numToHex } from '../shared/hex.js';
import { sleep } from '../shared/async.js';

export async function findRealHash(
  tezlink:       TezlinkClient,
  evmAlias:      string,
  fromBlock:     string,
  claimedHashes: Set<string>,
  maxAttempts = 15,
  intervalMs  = 2000,
): Promise<string | null> {
  return attemptFind(
    tezlink,
    hexToNum(fromBlock),
    evmAlias.toLowerCase(),
    claimedHashes,
    maxAttempts,
    intervalMs,
  );
}

async function attemptFind(
  tezlink:       TezlinkClient,
  startBlock:    number,
  alias:         string,
  claimedHashes: Set<string>,
  attemptsLeft:  number,
  intervalMs:    number,
): Promise<string | null> {
  if (attemptsLeft <= 0) return null;

  const headBlock = hexToNum(await tezlink.blockNumber());
  const found = await scanRange(tezlink, startBlock, headBlock, alias, claimedHashes);
  if (found !== null) return found;

  await sleep(intervalMs);
  return attemptFind(tezlink, startBlock, alias, claimedHashes, attemptsLeft - 1, intervalMs);
}

async function scanRange(
  tezlink:       TezlinkClient,
  from:          number,
  to:            number,
  alias:         string,
  claimedHashes: Set<string>,
): Promise<string | null> {
  if (from > to) return null;

  const found = await scanBlock(tezlink, from, alias, claimedHashes);
  return found ?? scanRange(tezlink, from + 1, to, alias, claimedHashes);
}

async function scanBlock(
  tezlink:       TezlinkClient,
  blockNum:      number,
  alias:         string,
  claimedHashes: Set<string>,
): Promise<string | null> {
  const block = await tezlink.getBlockByNumber(numToHex(blockNum), true);
  if (block === null || block.transactions.length === 0) return null;

  console.info(
    `[TezosX Relayer] scanBlock ${numToHex(blockNum)} →`,
    block.transactions.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to:   tx.to,
    })),
  );

  const candidates = block.transactions
    .filter((tx) => !claimedHashes.has(tx.hash) && tx.from.toLowerCase() === alias)
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
