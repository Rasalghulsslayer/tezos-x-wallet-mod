/**
 * Content script (ISOLATED world). The Beacon SDK half of the wallet's
 * `post_message` transport — pairing, decryption, and the relay to the service
 * worker.
 *
 *   page ──▶ content/beacon-announce.ts ──▶ (this file) ──▶ service worker
 *
 * `beacon-announce.ts` owns the `window` listener, because it must be registered
 * synchronously and this file cannot be (it dynamically imports the SDK, which
 * makes @crxjs emit it behind a loader — see that file's header). The two share
 * the ISOLATED world's `window` but not module scope, so the hand-off is a
 * property on it: frames buffer there until this half installs `onFrame`.
 *
 * Runs beside `content/bridge.ts` on the same window. The three cannot collide:
 * Beacon frames carry `target: 'toExtension' | 'toPage'` and no `type`, the
 * EIP-1193 bridge's frames carry `type: 'TEZOSX_WALLET_*'` and no `target`, and
 * each listener drops what is not its own.
 *
 * WHY THE TRANSPORT IS HERE AND NOT IN THE SERVICE WORKER. `@tezos-x/octez.connect-core`
 * resolves its `windowRef` to `window` when one exists and to a loopback mock
 * otherwise (`dist/esm/MockWindow.js:22-30`); an MV3 service worker has none, so a
 * Beacon post_message transport there would talk to itself. The ISOLATED world
 * shares the page's window for `postMessage`, which is what `bridge.ts` already
 * relies on.
 *
 * NO KEYS AND NO DECISIONS HERE. This script owns the Beacon wire protocol and
 * nothing else: every request is relayed to the service worker, which holds the
 * vault, enforces the sender guard, and runs the user approval. The `requestId`
 * the approval queue keys on is minted here, so the page can neither choose nor
 * collide it — the same rule the EIP-1193 bridge follows.
 */

import type { BeaconSession } from '../shared/beacon/session';
import {
  BEACON_HANDOFF_KEY,
  BEACON_WALLET_NAME,
  classifyPageFrame,
  wrapToPageFrame,
  type InboundFrame,
  type ToPageFrame,
} from '../shared/beacon/page-frames';

const EXTENSION_ID = chrome.runtime.id;

/** Same mark the EIP-6963 announcement uses, so one wallet reads as one wallet. */
const WALLET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
  "%3Crect width='100' height='100' rx='22' fill='%237c5cff'/%3E" +
  "%3Ctext x='50' y='70' font-size='58' text-anchor='middle' fill='white' font-family='Arial%2C sans-serif' font-weight='bold'%3ET%3C/text%3E" +
  '%3C/svg%3E';

function postToPage(frame: ToPageFrame): void {
  window.postMessage(wrapToPageFrame(frame, EXTENSION_ID), window.location.origin || '*');
}

// ── The Beacon session, loaded on the first frame that needs it ───────────────

type PendingFrame = Extract<InboundFrame, { kind: 'pairing' | 'message' }>;

let booting: Promise<BeaconSession> | null = null;
let queued: PendingFrame[] = [];

/**
 * Load the SDK and start a session. Deferred until a dApp actually pairs or
 * sends: the discovery ping is answered by the announce half with no SDK at all,
 * and almost every Beacon dApp pings on load without ever pairing — so the
 * per-page cost stays a few kB instead of ~145 kB.
 */
function ensureSession(): Promise<BeaconSession> {
  booting ??= (async () => {
    const { startBeaconSession } = await import('../shared/beacon/session');
    const session = await startBeaconSession({
      name:         BEACON_WALLET_NAME,
      iconUrl:      WALLET_ICON,
      postToPage,
      origin:       window.location.origin,
      newRequestId: () => crypto.randomUUID(),
      send:         (envelope) => chrome.runtime.sendMessage(envelope),
    });
    console.info('[TezosX Wallet] beacon wallet client ready (post_message)');
    return session;
  })().catch((err: unknown) => {
    // Let the next frame retry rather than wedging the page on one failure.
    booting = null;
    throw err;
  });
  return booting;
}

async function deliver(session: BeaconSession, frame: PendingFrame): Promise<void> {
  if (frame.kind === 'pairing') await session.pair(frame.payload);
  else session.accept(frame.encryptedPayload);
}

/**
 * Queue a frame and drain once the session is up. Order survives because the
 * drain runs after `ensureSession()` settles and walks the queue in sequence — a
 * pairing must reach the transport before the encrypted frames that follow it.
 */
function enqueue(frame: PendingFrame): void {
  queued.push(frame);
  void ensureSession()
    .then(async (session) => {
      const batch = queued;
      queued = [];
      for (const pending of batch) {
        try {
          await deliver(session, pending);
        } catch (err) {
          console.warn(`[TezosX Wallet] beacon ${pending.kind} failed:`, err);
        }
      }
    })
    .catch((err: unknown) => {
      queued = [];
      console.warn('[TezosX Wallet] beacon session failed to start:', err);
    });
}

/** Classify one raw frame from the announce half and act on it. */
function accept(data: unknown): void {
  const frame = classifyPageFrame(data, EXTENSION_ID);
  // 'ping' never reaches here — the announce half answers it inline — and
  // 'ignore' was already filtered by target, but both are handled for
  // completeness so a change on either side cannot silently fall through.
  if (frame.kind === 'pairing' || frame.kind === 'message') enqueue(frame);
}

// ── Pick up the hand-off ──────────────────────────────────────────────────────
//
// Drain what buffered while this chunk was loading, THEN install `onFrame`, so no
// frame is processed twice and none is lost in between (JS is single-threaded, so
// nothing can arrive between the two statements).

const handoff = (window[BEACON_HANDOFF_KEY] ??= { buffered: [] });
const buffered = handoff.buffered.splice(0);
handoff.onFrame = accept;
for (const data of buffered) accept(data);

console.info(`[TezosX Wallet] beacon bridge loaded (${buffered.length} buffered frame(s))`);

export {};
