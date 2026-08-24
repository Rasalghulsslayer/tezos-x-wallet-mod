/**
 * Content script (ISOLATED world), self-contained on purpose. Answers Beacon's
 * extension-discovery ping, and buffers every other Beacon frame for
 * `content/beacon-bridge.ts` to pick up once the SDK has loaded.
 *
 * ── WHY THIS IS A SEPARATE FILE WITH NO IMPORTS ───────────────────────────────
 *
 * Beacon's discovery is ONE-SHOT with no recovery.
 * `PostMessageTransport.listenForExtensions()` posts `{target:'toExtension',
 * payload:'ping'}` exactly once — a module-level `listeningForExtensions` flag
 * guards it — at the dApp bundle's module load, and a wallet only ever pongs in
 * answer to a ping. Miss that one frame and the wallet is absent from the pairing
 * modal for the entire page load, with nothing logged anywhere.
 *
 * So the listener must be registered before page script runs.
 * `@crxjs/vite-plugin` emits a content script as a synchronous IIFE only when the
 * file is FULLY self-contained; a single surviving import — static or dynamic —
 * makes it an ES module chunk behind a generated loader that `await import()`s
 * it, which pushes registration behind two sequential module loads. Measured on
 * this build: `bridge.ts` (type-only imports) emits an IIFE, while
 * `beacon-bridge.ts` (which must dynamically import the SDK) gets a loader.
 *
 * Hence the split. This half is import-free and therefore synchronous; the other
 * half carries the Beacon SDK and may take as long as it needs.
 *
 * The cost is a deliberate, contained duplication: the two `ExtensionMessageTarget`
 * literals and the sender/origin guard also exist in `shared/beacon/page-frames.ts`,
 * which stays the tested source of truth for frame classification.
 * `page-frames.test.ts` pins the literals against the real SDK enum, and
 * `beacon-announce.test.ts` pins this file's behaviour, so the copies cannot
 * drift apart silently.
 */

/**
 * The hand-off point between the two halves, on the ISOLATED world's `window`.
 * Both content scripts share that global object but not module scope, so the
 * contract is a property rather than an import.
 *
 * Kept in sync by hand with `shared/beacon/page-frames.ts`'s
 * `BEACON_HANDOFF_KEY` — `beacon-announce.test.ts` asserts they match.
 */
const HANDOFF = '__tezosxBeaconHandoff';

/** Beacon's `ExtensionMessageTarget.EXTENSION`. */
const TO_EXTENSION = 'toExtension';
/** Beacon's `ExtensionMessageTarget.PAGE`. */
const TO_PAGE = 'toPage';

/** How the wallet identifies itself in Beacon's extension discovery. */
const WALLET_NAME = 'TezosX Wallet';

/** Same mark the EIP-6963 announcement uses, so one wallet reads as one wallet. */
const WALLET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E" +
  "%3Crect width='100' height='100' rx='22' fill='%237c5cff'/%3E" +
  "%3Ctext x='50' y='70' font-size='58' text-anchor='middle' fill='white' font-family='Arial%2C sans-serif' font-weight='bold'%3ET%3C/text%3E" +
  '%3C/svg%3E';

/**
 * How many frames to hold before the other half is ready. A pairing plus its
 * first few requests is a handful; past this a page is looping, and dropping
 * with a warning beats letting a page-driven buffer grow without bound.
 */
const MAX_BUFFERED = 32;

// `BeaconHandoff` and the `Window` property are declared ambiently in
// `shared/beacon/handoff.d.ts` — this file is a SCRIPT, not a module, so it can
// neither import them nor host a `declare global` of its own.
const handoff: BeaconHandoff = window[HANDOFF] ?? { buffered: [] };
window[HANDOFF] = handoff;

function postPong(): void {
  window.postMessage(
    {
      target:  TO_PAGE,
      payload: 'pong',
      // FLAT, not nested under `message`: PostMessageTransport.listenForExtensions
      // reads event.data.payload and event.data.sender. Nesting it makes the
      // wallet invisible in the pairing modal, with no error anywhere.
      sender:  {
        id:        chrome.runtime.id,
        name:      WALLET_NAME,
        shortName: 'TezosX',
        iconUrl:   WALLET_ICON,
      },
    },
    window.location.origin || '*',
  );
}

window.addEventListener('message', (event: MessageEvent) => {
  // Only this window, only this origin — the same guard the Beacon SDK applies on
  // its own side. Content scripts declare no `all_frames`, so this runs in the top
  // document only; a subframe posting to its parent arrives with `event.source`
  // set to the subframe's window and is rejected here.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  const data = event.data as { target?: unknown; payload?: unknown } | null | undefined;
  if (data == null || typeof data !== 'object') return;
  if (data.target !== TO_EXTENSION) return;

  // The one frame that must never be missed, answered with nothing awaited and no
  // SDK loaded.
  if (data.payload === 'ping') {
    postPong();
    return;
  }

  if (handoff.onFrame != null) {
    handoff.onFrame(data);
    return;
  }
  if (handoff.buffered.length >= MAX_BUFFERED) {
    console.warn('[TezosX Wallet] beacon frame dropped: too many buffered while starting up');
    return;
  }
  handoff.buffered.push(data);
});

console.info('[TezosX Wallet] beacon announce ready');
