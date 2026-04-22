import type { TezlinkClient } from '../tezlink.js';
import { hexToNum, numToHex } from './hex.js';
import { sleep } from './async.js';

/**
 * Map a synthetic NAC hash back to the real EVM transaction hash by scanning
 * blocks from `fromBlock` to head, matching the first unclaimed tx whose
 * `from` equals `evmAlias`. Retries up to `maxAttempts` times with
 * `intervalMs` delay. Returns the real hash or null.
 */
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

// ── Internals ─────────────────────────────────────────────────────────────────

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

  // Kernel-synthesized tx may list the alias as `from` OR `to` depending on
  // the cross-runtime flow, so we match both sides.
  const match = block.transactions.find(
    (tx) =>
      !claimedHashes.has(tx.hash) &&
      (tx.from.toLowerCase() === alias || tx.to?.toLowerCase() === alias),
  );
  if (match === undefined) return null;

  claimedHashes.add(match.hash);
  return match.hash;
}