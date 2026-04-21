import type { TezlinkClient } from '../tezlink.js';
import type { EthTransactionReceipt } from '../types.js';
import { hexToNum, numToHex } from './hex.js';
import { sleep } from './async.js';

/**
 * Map a synthetic NAC hash back to the real EVM receipt by scanning blocks
 * from `fromBlock` to head, matching the first unclaimed tx whose `from`
 * equals `evmAlias`. Retries up to `maxAttempts` times with `intervalMs` delay.
 */
export async function findRealReceipt(
  tezlink:       TezlinkClient,
  evmAlias:      string,
  fromBlock:     string,
  claimedHashes: Set<string>,
  maxAttempts = 15,
  intervalMs  = 2000,
): Promise<EthTransactionReceipt | null> {
  return attemptFind(
    tezlink,
    hexToNum(fromBlock),
    evmAlias.toLowerCase(),
    claimedHashes,
    maxAttempts,
    intervalMs,
  );
}

// ── Internals ─────────────────────────────────────────────────────────────────

async function attemptFind(
  tezlink:       TezlinkClient,
  startBlock:    number,
  alias:         string,
  claimedHashes: Set<string>,
  attemptsLeft:  number,
  intervalMs:    number,
): Promise<EthTransactionReceipt | null> {
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
): Promise<EthTransactionReceipt | null> {
  if (from > to) return null;

  const found = await scanBlock(tezlink, from, alias, claimedHashes);
  return found ?? scanRange(tezlink, from + 1, to, alias, claimedHashes);
}

async function scanBlock(
  tezlink:       TezlinkClient,
  blockNum:      number,
  alias:         string,
  claimedHashes: Set<string>,
): Promise<EthTransactionReceipt | null> {
  const block = await tezlink.getBlockByNumber(numToHex(blockNum), true);
  if (block === null) return null;

  const match = block.transactions.find(
    (tx) => !claimedHashes.has(tx.hash) && tx.from.toLowerCase() === alias,
  );
  if (match === undefined) return null;

  const receipt = await tezlink.getTransactionReceipt(match.hash);
  if (receipt === null) return null;

  claimedHashes.add(match.hash);
  return receipt;
}
