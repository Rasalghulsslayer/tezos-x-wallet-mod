# Test diary — Beacon wallet provider, milestone 1 (`permission_request`)

**Branch:** `feat/beacon-wallet-provider` · **Dates:** 2026-08-21 → 2026-08-24 · **Scope:** milestone 1 only
**Suites:** 8 files, 139 new tests · **Gates:** tsc 0 across relayer + relayer/ext + core + wallet · eslint 0 errors (10 pre-existing warnings, unchanged) · vitest **579 passing across 61 files** (440 / 53 before, **+139 / +8**) · `npm run build:wallet` ✓ including a new content-script gate
**Reviewer pass:** REQUEST-CHANGES → all findings closed (1 blocker, 2 major, 1 minor, 1 nit). Details in §4.
**Live run against the MAPS dApp, 2026-08-24: MILESTONE 1 CONFIRMED, definition of done met.**
Both hard-gate lines printed, verbatim from the operator's console:

```
[MAPS wallet] network gate OK: Tezos X previewnet @ https://michelson.previewnet.tezosx.nomadic-labs.com
[MAPS wallet] paired wallet: TezosX Wallet
```

Granted to `tz1cCWjCcVi4bbAbnrsHwbBiqVJcSVTaaSEb`, scopes `[operation_request]`, over
`@ecadlabs/beacon-dapp` 4.8.1-ecad.7 in Chrome with MetaMask also installed. Four defects were found
by that run (§4.1) — one of them a bug in beacon-ui that made an unregistered extension *impossible*
to select. What the run has and has not established is in §3.1/22-27 and §3.2.

`[MAPS wallet] transport: post_message` did **not** print, and its absence is correct rather than a
gap: `assertSignableTransport` — the only thing that logs it — is called before a ceremony operation,
not at connect (`connectBeacon` only warns, and only for WalletConnect). It is a milestone-2
observable.

> **Deviation from the per-suite diary rule, stated rather than quiet.** The convention is one diary
> per suite file. This is one diary for eight suites, because they are eight layers of a *single*
> wire protocol and read apart each loses the thread that makes it meaningful. Every suite still gets
> its own rationale and full test-case table (§6). Splitting into eight files is a one-line ask.

---

## 1. Why this work exists

The wallet already *is* a Michelson wallet — `packages/core/src/adapters/tezos/tezos-signer.ts` holds
a tz1 secret key, derives fees from the live `mempool/filter` schedule with a 1.5× buffer, and injects
operations at `TEZOS_L1_RPC`. But it only ever spoke EIP-1193, so a Beacon dApp could not reach it at
all. Milestone 1 makes a Beacon dApp able to **connect**: `permission_request` in,
`permission_response` out, carrying the tz1, its `edpk`, and a network object whose `rpcUrl` is the
previewnet Michelson RPC.

The load-bearing part is that last field. The MAPS dApp's `checkBeaconNetwork`
(`frontend/src/web3/beacon.ts:156-181`) **decides on `rpcUrl` and nothing else**, and treats a missing
one as a refusal rather than a pass. So the response is not "a shape that looks right" — it is an
answer a specific gate judges.

---

## 2. The handshake, as implemented

```
  MAIN world (dApp page)              ISOLATED world                      service worker
  @ecadlabs/beacon-dapp 4.8.1-ecad.7                                      composition/sw-wiring.ts
 ───────────────────────────────────  ─────────────────────────────────    ────────────────────────
                                      content/beacon-announce.ts
                                      1.0 kB · IIFE · no imports
                                      listener live at document_start
  getAvailableExtensions()
   {target:'toExtension',payload:'ping'} ─▶ answered INLINE, no SDK
                                      ◀─ {target:'toPage',payload:'pong',
       listenForExtensions reads          sender:{id,name:'TezosX Wallet',…}}   ← FLAT
       data.payload / data.sender

  user picks "TezosX Wallet" in the modal
  sendPairingRequest(extension.id)
   {…,payload:<bs58>,targetId:<our id>} ─▶ buffered on window.__tezosxBeaconHandoff
                                              │
                                      content/beacon-bridge.ts (2.6 kB, behind a loader)
                                      drains the buffer, installs onFrame
                                              │  lazy import: shared/beacon/session (146 kB)
                                              ▼
                                      readPairingRequest (fields clamped)
                                      WalletClient.addPeer()
                                      ◀─ {message:{target:'toPage',payload:<sealed box>},
       listenForChannelOpening            sender:{id}}                          ← NESTED
       openCryptobox(payload, own keys)

  requestPermissions() → makeRequest stamps version:'2'
   {…,encryptedPayload}               ─▶ transport decrypts → WalletClient
                                      ◀─ acknowledge
                                         narrowPermissionRequest (network/scopes validated)
                                              │ BEACON_REQUEST {origin,requestId,network,scopes}
                                              └──────────────────────▶ dispatch
                                                                       sender guard (dapp channel
                                                                         + origin match)
                                                                       keyring unlocked?
                                                                       account.kind==='tezos'?
                                                                       checkRequestedNetwork
                                                                       approvalQueue.enqueue
                                                                         {kind:'connect',
                                                                          protocol:'beacon'}
                                                                            │ ConnectView
                                                                            │ user decides
                                              ◀──────────────────────  BeaconPermissionGrant
                                      ◀─ permission_response
                                         {address:tz1, publicKey:edpk,
       onNewAccount: accountInfo          network:{custom,previewnet,rpcUrl},
         .network = message.network       scopes:['operation_request'],
       checkBeaconNetwork(rpcUrl) ✓       walletType:'implicit'}
```

Two things the diagram is drawn to make visible:

- **The pong is flat; everything else is nested under `message`.** Both shapes mirror a reader in the
  dApp's own SDK, cited in `page-frames.ts`. A nested pong makes the wallet invisible in the pairing
  modal with no error anywhere.
- **The listener and the SDK are in different files on purpose.** See §4/M2.

---

## 3. MEASURED vs ASSUMED

Everything in §3.1 was read out of installed code or a build artefact. Everything in §3.2 was
reasoned about and is **not** established.

### 3.1 Measured

| # | Fact | How |
|---|---|---|
| 1 | **`@airgap/beacon-wallet` was NOT installed, and neither was anything else** — no `node_modules` anywhere in the repo. The brief's "ALREADY INSTALLED / verified typeof === 'function'" did not hold in this checkout. It *is* in `package-lock.json` at 4.8.1, transitively via `@airgap/beacon-sdk` (`packages/relayer/package.json:33`), and a declared dep of no workspace. | `ls node_modules` → ENOENT; `grep beacon packages/*/package.json`; lockfile lines 89-106, 190-199. Fixed by `npm install` + four direct deps added to `packages/wallet/package.json`. |
| 2 | **The SDK's `WalletPostMessageTransport` cannot carry a wallet.** It is a bare storage-key subclass whose inherited `PostMessageClient` is hard-coded dApp-direction: `sendMessage` posts `target:'toExtension'`, `subscribeToMessages` fires only on `data.message.target==='toPage'`. Both are the mirror of what a wallet needs. It also never sets `sender`, which the dApp reads as `event.data.sender.id`. | `beacon-transport-postmessage/dist/esm/PostMessageClient.js:31-42, 80-99`; `beacon-wallet/dist/esm/transports/WalletPostMessageTransport.js` (whole file is one `super(...)` call). Hence `ExtensionPostMessageTransport` is hand-written. |
| 3 | `WalletP2PTransport` **does** override `addPeer` to send the pairing response — so overriding `addPeer` is the SDK's own idiom, not an invention. Base `Transport.addPeer` accepts `sendPairingResponse` and drops it. | `beacon-wallet/dist/esm/transports/WalletP2PTransport.js:14-19`; `beacon-core/dist/esm/transports/Transport.js:111-115`. |
| 4 | **A Beacon post_message transport cannot live in an MV3 service worker.** `beacon-core`'s `windowRef` is `window` when one exists and a **loopback mock** otherwise — a SW has no `window`, so it would post to itself. | `beacon-core/dist/esm/MockWindow.js:5-30`. Hence the transport lives in the ISOLATED content script; keys and decisions stay in the SW. |
| 5 | **`WalletClient.init()` hardcodes a Matrix P2P transport** and takes no argument; `setTransport` is `protected`; `WalletPostMessageTransport` is not in the public exports. There is no supported way to inject a transport. | `beacon-wallet/dist/esm/client/WalletClient.js:39-43`; `beacon-core/dist/esm/clients/client/Client.d.ts`. Hence `ExtensionBeaconWalletClient.init()` calls `Client.prototype.init` directly — and booting the shipped `init()` would open a public Matrix relay from every page. |
| 6 | **Exactly one message listener is registered, not zero and not two.** `Client.init(transport)` only calls `setTransport`; `Client.addListener` is never reached on the wallet path (only `DAppClient` calls it); `WalletClient._connect()` registers the single `transport.addListener`. So reaching past `WalletClient.init()` loses nothing. | `beacon-core/dist/esm/clients/client/Client.js:107-113, 168-184`; `beacon-wallet/dist/esm/client/WalletClient.js:135-158`. |
| 7 | **The dApp's permission request arrives as v2**, so `respond()` takes the enriching `handleV2Message` branch (which injects `senderId`/`version`/`appMetadata`), not the v3 pass-through. `DAppClient.makeRequest` stamps `version: '2'` with the comment "This is the old version"; `version:'3'` belongs to `makeRequestV3` (`blockchain_request` only). | `@ecadlabs/beacon-dapp/dist/esm/dapp-client/DAppClient.js:1716`, `:1779`. Also why the response passes none of those three fields — `...message` spreads **last** in the interceptor, so anything we set would override the correct injected value. Asserted in `session.test.ts`. |
| 8 | **`accountInfo.network` is the wallet's own answer, verbatim** — `network: message.network`. The dApp gate judges what we send, so echoing the *request's* network back would make the gate check its own question. | `DAppClient.js:1992` (`onNewAccount`). Hence `WALLET_BEACON_NETWORK` is reported and the request is *checked*. |
| 9 | The MAPS dApp runs `@ecadlabs/beacon-*@4.8.1-ecad.7`, not `@airgap`. Its `PostMessageTransport` is **byte-identical** to the `@airgap@4.8.0` one and `BEACON_VERSION` is `'3'` on both — the two builds are wire-compatible for this path. | `diff` of the two `PostMessageTransport.js`; `beacon-core/dist/esm/constants.js:2` in each tree. |
| 10 | **The gate accepts our exact answer.** `checkBeaconNetwork` and the reachable half of `onNewAccount` are transcribed verbatim into `responses.test.ts` and run against the real `permissionResponseFor` output. The printed line resolves to `Tezos X previewnet @ https://michelson.previewnet.tezosx.nomadic-labs.com`. | `responses.test.ts` — "PASSES the dApp network gate". A *transcription* of the dApp, not the dApp: see §3.2/1. |
| 11 | `getAddressFromPublicKey('edpk…')` on the response's public key yields the same tz1 the response carries. | `responses.test.ts`, using the SDK's own helper. |
| 12 | **`PeerManager.addPeer` dedupes on `publicKey` ALONE**, so a page looping pairings with a fresh random key each time appends forever; and `IncomingRequestInterceptor.handleV2Message` persists the dApp's **self-declared** `appMetadata` *before* the interceptor callback, i.e. before the SW sees the request at all. Both lists share the 10 MB `chrome.storage.local` namespace with the encrypted vault, the extension requests no `unlimitedStorage`, and nothing prunes `beacon:*` — `RESET_WALLET` included. | `beacon-core/dist/esm/managers/PeerManager.js:22-24`, `StorageManager.js:26-38`, `AppMetadataManager.js:20-22`; `beacon-wallet/dist/esm/interceptors/IncomingRequestInterceptor.js:42-44`; `chrome-vault-store.ts:9-18`; `manifest.json` permissions. → §4/M1. |
| 13 | **The SDK's own `ChromeStorage.get` reads the ENTIRE extension namespace** (`chrome.storage.local.get(null, …)`) and then picks one key — so every Beacon read would pull the encrypted vault and every snapshot into a content script running on every page. | `beacon-core/dist/esm/storage/ChromeStorage.js:15-31`. Hence `ChromeBeaconStorage`, which is key-scoped and also `remove`s on delete instead of writing `undefined`. |
| 14 | **The eager per-page cost is 5.0 kB.** Three measured states of the same code: a static `WalletClient` import put **147.21 kB** (48.30 gzip) on every page with `AxiosError` + `MatrixHttpClient` in the chunk — Rollup cannot prove the overridden `init()` dead. Moving the SDK behind `shared/beacon/session` + a dynamic `import()` cut the eager chunk to **11.54 kB**. Making the wire-format module type-only against the SDK and splitting the announce half out cut it to **5.01 kB total** (`bridge.ts` 1046 B + `beacon-announce` 1018 B + loader 349 B + bridge chunk 2595 B), with **145.8 kB** lazy and reached only on a real pairing. | Three builds; sizes read off Rollup's output and `os.path.getsize` on `dist/assets`; `grep AxiosError`/`MatrixHttpClient` per chunk. |
| 15 | **`beacon-announce.ts` is emitted as a synchronous IIFE with zero imports**, registered directly as a content script (no loader), with its `addEventListener` inline — while `beacon-bridge.ts`, which must dynamically import the SDK, gets a crxjs loader. | `dist/assets/beacon-announce.ts-*.js` begins `(function(){var e=…`; `grep -c import` → 0; `dist/manifest.json` lists it directly. → §4/M2. |
| 16 | The lazy chunk and its deps **are registered in `web_accessible_resources`** (`session-*.js`, `constants-*.js`, …), so the dynamic import resolves from a content script — the same mechanism crxjs's own loader uses. `postbuild-manifest.mjs` strips only `*` and `.html`, so they survive. | `dist/manifest.json` after build; `scripts/postbuild-manifest.mjs`. Structural, not a page load: see §3.2/3. |
| 17 | **Content scripts do NOT get a global `Buffer`, and the Beacon SDK needs one in 36 places on the path we execute.** The session chunk carried 36 bare `Buffer.from/concat/alloc` sites and zero polyfill markers, while the popup/SW chunks carried both — a controlled comparison. After the fix, `globalThis.Buffer===void 0&&(globalThis.Buffer=m.Buffer)` is present in `constants-*.js`, which is the session chunk's first import. | `grep -c INSPECT_MAX_BYTES` / `globalThis.Buffer=` per chunk, before and after. → §4/B1. |
| 18 | **Milestone 1 makes zero chain reads.** `handleBeaconRequest` builds no container and no signer, and none of the new modules can reach the network. | `grep -E "fetch\|TezosToolkit\|RpcClient\|axios\|http"` over all new files → one hit, the `xmlns` in the icon data-URI. |
| 19 | **No by-block-hash context query is introduced, and none exists on the signer's path either.** Every `readProvider` call in Taquito 24.3's prepare + estimate providers goes via `'head'`: 18× `getProtocolConstants('head')`, `getCounter(pkh,'head')`, `getNextProtocol('head')`, and `getBlockHash(block ?? 'head~2')` for the branch (a `/hash` read, 0.09–0.60 s per the previewnet note). | Enumerated with `grep -noE "readProvider\.[a-zA-Z]+\([^)]*\)"` over both providers; `getHeadCounter` → `getCounter(pkh,'head')` at `prepare-provider.js:49-51`. **This is why this wallet is on the fast path where Temple is not.** |
| 20 | Content scripts declare no `all_frames`, so all three run in the **top document only**; a subframe posting to its parent arrives with `event.source` set to the subframe's window and is rejected by the guard. | `manifest.json` (no `all_frames`); guard asserted in `beacon-announce.test.ts`. |
| 22 | **The wallet is discovered and listed in a real dApp's pairing modal.** All three content scripts load (`content bridge loaded`, `beacon announce ready`, `beacon bridge loaded (0 buffered frame(s))`), the pong is captured by `listenForExtensions`, and the tile appears under "show more" — the non-featured bucket, which is correct: `Sn` partitions on `key.startsWith("kukai"\|"temple"\|"plenty"\|"umami")`. | Live run, 2026-08-24, MAPS dApp on previewnet. |
| 23 | **The hand-written transport's pairing handshake is correct against the real dApp.** Selecting the wallet and confirming produced a completed pairing — i.e. the sealed `postmessage-pairing-response` was opened by the dApp's own `openCryptobox`, the frame nesting and the `sender.id` stamp were accepted, and the channel opened. This is the claim §3.2/1 previously could not make: the unit suites checked our wire format against the SDK's *reader code*; this checked it against the *running dApp*. | Same run. |
| 24 | **`beacon-ui` renders an unregistered extension's list entry from `shortName ?? name`,** so a `shortName` makes the modal disagree with every other surface. Observed directly: the tile read "TezosX" until the field was dropped. | Same run. → §4.1/L1. |
| 25 | **`beacon-ui` gates the wallet detail panel on `types.length`,** making an extension-only wallet unselectable. Observed as: tile present, click collapses the list, no pairing frame posted, nothing logged on either side — while Temple, in the same list, opened its panel. | Same run + the guard read off the shipped bundle. → §4.1/L2. |
| 26 | **The full grant completes and the dApp accepts it.** `permission_request` → approval prompt → `permission_response` → `onNewAccount` → `checkBeaconNetwork` passing. So the response's `network`, `publicKey`, `address`, `scopes` and `walletType` are all accepted by the running `DAppClient`, and the v2 interceptor path (Measured 7) does inject `senderId`/`version`/`appMetadata` as designed — the stack trace shows `handleV2Message → interceptorCallback → respondToMessage → sendMessage → postToPage`. | Live run, 2026-08-24. |
| 27 | **A locked wallet refuses the request and the dApp cannot tell that from a user rejection.** Observed on the first attempt: `beacon permission_request refused (4100): Wallet is locked` wallet-side, `Uncaught (in promise) AbortedBeaconError` dApp-side, and **nothing at all in the wallet UI** — no prompt, no window, no badge. Unlocking and retrying succeeded. Predicted in the previous revision of this diary as a UX gap; now measured. | Same run. → §4.1/L4. |
| 21 | The existing EIP-1193 path is untouched behaviourally. The one shared-code change is a mechanical extraction of the enqueue-refusal block into `requestApproval`, so both dApp surfaces clear the same per-origin flood cap; the pre-existing `sw-wiring-approval` and `sw-wiring-multi-account` suites pass unchanged. | Full `npm test`: 579 passing, 0 failing. |

### 3.2 Assumed / UNVERIFIED — report, do not paper over

Rows 1-5 below were **closed by the live run of 2026-08-24** and are kept, struck through, rather than
deleted: what they predicted and what actually happened is the useful record. Rows 6 onward remain
open.

| # | Not established | Why it matters |
|---|---|---|
| 1 | ~~That the three console lines actually print.~~ **CLOSED — pairing confirmed live.** The transcription of the dApp's gate did not drift: the wire format the unit suites pinned against the SDK's reader code was accepted by the running dApp. See §3.1/22-23. | Was the stated definition of done. |
| 2 | ~~That the wallet appears in Beacon's pairing modal.~~ **CLOSED — it is listed,** under "show more" (the non-featured bucket, which is correct). The `data:image/svg+xml` icon is accepted. Two real defects surfaced here that no unit test could have caught: §4.1/L1 and L2. | — |
| 3 | ~~That the dynamic `import()` resolves at runtime in the content script.~~ **CLOSED.** `beacon bridge loaded` appears in the page console and the session booted on the first pairing frame, so the lazy chunk resolves from a content script exactly as the `web_accessible_resources` argument predicted. | — |
| 4 | ~~The actual outcome of the discovery race.~~ **CLOSED for this dApp.** The announce half's listener was in place before the ping; discovery succeeded on the first attempt. Whether the pre-fix loader would have lost the race here is now moot and untestable. | — |
| 5 | **Behaviour with several wallet extensions on one page.** Partly closed: MetaMask was live during the run (its `contentscript.js`/`inpage.js` noise is in the log) and did not interfere — but MetaMask does not speak Beacon. A second *Beacon* extension on the same page is still untested, and that is the case `targetId` routing exists for. | The exact condition under which "which popup am I confirming?" became unanswerable before. |
| 6 | **A request whose `appMetadata.senderId` differs from its message `senderId`.** The SDK looks appMetadata up by the request's `senderId` and throws `AppMetadata not found` on a mismatch; our `respond()` catches and logs, so it degrades to *no answer plus a console warning* and the dApp waits. Real `DAppClient` always sets the two equal, so this is a latent edge, not a live bug. | Would present as a hang with no dApp-side error. |
| 7 | **Whether B1 was the only realm failure.** The `Buffer` gap is proven and gated, but a fixed build may hit further SDK globals (`self`/`window` assumptions, `crypto.subtle`) that only a real content script exposes. | The reviewer found B1 and M2 in the artefacts, which is a fair indication of what a live run would surface. |
| 8 | **Storage-quota behaviour.** That `chrome.storage.local.set` rejects rather than truncating at the 10 MB boundary, and what the resulting vault-write failure looks like. §4/M1 bounds the growth; it does not test the boundary. | Bounded growth makes the boundary unreachable in practice, not impossible. |
| 9 | **Anything past connect.** `operation_request` is **not implemented** — answered with `UNKNOWN_ERROR` (deliberately not `ABORTED_ERROR`, so "not built yet" cannot read as "the user said no"). `sign` is not granted. | Milestone 2. |
| 10 | **That the full 23-op native ceremony completes.** Untouched. Phase 2 deploys wrapper bytecode via `%call_evm` with large payloads and whether the `CALL_EVM_*` fixed-ceiling fallback covers it is unknown. | Explicitly out of scope; no claim made. |
| 11 | **That a Beacon connection is manageable from the wallet UI.** No `StoredSession` is written (deliberately — §5/2), so a Beacon grant does not appear in Connected sites and the wallet's `DISCONNECT` does not revoke it. The SDK's own `beacon:permissions` record is the only session state. | A user cannot revoke a Beacon connection from the wallet today. Real gap. |

---

## 4. Reviewer pass — REQUEST-CHANGES, all findings closed

A `reviewer` pass ran three lenses (protocol correctness against the installed dist, security,
reuse/consistency); each finding was then handed to an independent adversarial verifier instructed to
refute it. 10 of 15 candidate findings were refuted. The 5 that survived, and what was done:

### B1 — blocker — `Buffer` is undefined in the content-script realm

**Verified independently before acting.** The session chunk had 36 bare `Buffer.from/concat/alloc`
sites and no polyfill; `approval-display-*.js` (popup/SW graph) had both markers — a controlled
comparison. `buffer-shim` is imported by the service worker and the two UI entry points and by
nothing in the `content_scripts` graph, and `vite.config.ts` aliases the `buffer` *module* without
installing a global.

The failure shape was the worst available: `BeaconClient.initSDK()` swallows the rejection with
`.catch(console.error)`, so `_keyPair` — an `ExposedPromise` with no timeout — never settles,
`init()` awaits it forever, and the content script's retry reset never runs. One `console.error`,
then every later frame awaits the same dead promise for the life of the page.

**Every suite was blind to it**: `vitest.config.ts` sets `environment: 'node'`, where `Buffer` is a
global, so the SDK worked by accident. Green gates were not evidence about the content-script realm.

**Fixed** — `import '@tezosx/wallet-core/shared/buffer-shim';` as the first line of `session.ts`,
deliberately *not* the content script, so the polyfill stays in the lazy chunk (the eager chunk has
zero `Buffer` reads).

**Gated** — a runtime test is impossible here: deleting `globalThis.Buffer` takes Vitest's own worker
down with it (tried; V8 OOM). So the guard lives in `scripts/postbuild-manifest.mjs`, which CI's
`build-wallet` job runs: it walks each content script's transitive chunk graph (static, dynamic and
`__vite__mapDeps` edges) and fails the build if any chunk reads a bare global `Buffer` while none in
that graph assigns one. **Mutation-tested in both directions** — passes with the fix, fails the build
with the import removed.

### M2 — major — the listener attached asynchronously, so the one-shot ping could be missed

Beacon's discovery is one-shot with no recovery: `listenForExtensions()` posts the ping exactly once
(module-level flag) at the dApp bundle's module load, and a wallet only pongs in answer. Because
`beacon-bridge.ts` had a dynamic import, crxjs emitted it behind a loader, putting listener
registration behind two sequential module loads — losing the race against a dApp with an inline or
preload-scanned bundle, for the whole page load, silently.

**Fixed** by splitting the announce path into `content/beacon-announce.ts`: import-free, therefore
emitted as a synchronous IIFE (Measured 15), listener inline, answers the ping with no SDK loaded,
and buffers every other frame on `window.__tezosxBeaconHandoff` for the SDK half to drain. Getting
there also required making `shared/beacon/page-frames.ts` **type-only** against the SDK — a single
value import is enough to turn a content script into a module chunk.

The cost is a deliberate, contained duplication: two `ExtensionMessageTarget` literals, the
sender/origin guard, and the hand-off key exist in both halves. `page-frames.test.ts` pins the
literals against the real SDK enum and `beacon-announce.test.ts` pins the copies against the shared
module, so they cannot drift apart silently.

**Two claims in the previous version of this diary were wrong and are corrected above.** Old Measured
#12 read the loader only as proof the dynamic import resolves, never as a change to *when* the
listener registers. Old Assumed #3's stated failure floor — "the ping still answers, so the wallet
would appear and then do nothing" — was invalidated by the loader emission for the bridge chunk
itself; it is true again now, for the announce half, and §3.2/3 says so explicitly.

### M1 — major — any visited page could grow the vault's storage namespace without bound

Pairing is accepted **without a user prompt** (the wallet must answer the channel-open before a dApp
can ask for anything), needs no `targetId`, and persists the peer. With `PeerManager` deduping on
`publicKey` alone and `appMetadata` written by the SDK before the SW ever sees the request
(Measured 12), a page could append forever, or fill the namespace in one write with a multi-megabyte
`name` — and the encrypted vault shares that 10 MB namespace, with no in-product recovery.

**Fixed on both axes.** `readPairingRequest` clamps `id`/`name`/`version` to 128 chars (clamped, not
rejected — a long display name should still pair), which bounds each entry. `ChromeBeaconStorage.set`
bounds the three growable lists to 25 entries and 64 kB, dropping oldest-first. Pruning rather than
refusing, deliberately: a rejected write would leave the SDK believing it had persisted, and some of
its writes are fire-and-forget. The trade-off is that the least-recently-added pairing is evicted past
25 — stated, not hidden. The announce half caps its own pre-boot buffer at 32 frames.

*Not* origin-scoping the peer list, which one verifier proposed: `wallet-client.ts` deliberately uses
`chrome.storage.local` so one pairing holds across tabs. The cap is the fix, not the scoping.

### m1 — minor — page-controlled `network`/`scopes` reached core through an unchecked cast

`narrowPermissionRequest` passed `req.network as BeaconNetwork` and `req.scopes` with no runtime
check, and nothing upstream validates (`Serializer.deserialize` is bs58check + `JSON.parse`; the
interceptor re-emits verbatim apart from `appMetadata`). `{type:'custom', rpcUrl:123}` cleared the
`!= null && !== ''` test, `new URL(123)` threw, and the unguarded `catch` then threw
`TypeError: u.trim is not a function`. Nothing catches it: `handleBeaconRequest` returns out of the
dApp branch *before* the try that wraps `handlePopupRequest`, so `sendResponse` never fires. The
network throw lands before the prompt; the scopes throw lands *after* the user approves.

It also contradicted this module's own stated intent — `beacon.ts:8-10` claims core "cannot be steered
by a field the page invented", and `readPairingRequest` validates field-by-field two files away.

**Fixed at the boundary** (`readNetwork`/`readScopes` in `responses.ts`) **and defensively in core**
(`String(u).trim()` in `sameRpcUrl`, `Array.isArray` in `grantScopes`) — because core is also reached
from the mobile shell, and a helper that throws answers nothing at all rather than answering an error.

### n1 — nit — the `appUrl` comment stated the opposite of what the SDK does

The comment claimed `appUrl` was "left unset on purpose" to avoid labelling the wallet with the
visited site; `BeaconClient.js:51` is `this.appUrl = config.appUrl ?? windowRef.location.origin`, so
leaving it unset is precisely what makes it the page's origin. No defect — `appUrl` never reaches the
wire on this path — but wrong, in a file whose ethos is precisely-cited SDK claims. **Comment
corrected** to state that the fallback does fire, resolves to the paired dApp's own origin, and is
tolerated because it is never serialised.

## 4.1 What the LIVE RUN found — three defects no test could have caught

The reviewer pass found B1 and M2 in build artefacts. The live run found three more, and the two
substantive ones were both in `beacon-ui`, not in this wallet. Recorded because the pattern matters:
every remaining defect after the unit suites went green was in the *integration surface*, and each
was invisible from inside.

### L1 — the modal rendered "TezosX", not "TezosX Wallet"

`beacon-ui` builds an unregistered extension's entry as `name: e.shortName ?? e.name ?? ''`. The pong
sent `shortName: 'TezosX'`, so the tile read "TezosX" while the EIP-6963 announcement, the stored peer
record and every log line said "TezosX Wallet". An operator told to look for one name cannot find the
other. **Fixed** by dropping `shortName`. The hand-copied pong shape in the import-free announce half
is now asserted to deep-equal `buildPongFrame`, and the absence of `shortName` is its own test.

### L2 — an extension-only wallet is UNSELECTABLE in beacon-ui

The one that actually blocked the milestone. Clicking a wallet falls through to:

```js
I = e => !e
      || (e.types.length <= 1 && !e.types.includes("ios") && !e.types.includes("desktop"))
      || (isMobile && e.types.length === 1 && e.types.includes("desktop"))
      || setView(INSTALL)
```

`a || b || c || open()`, and the `INSTALL` view is the *only* thing that renders the detail panel
holding the "Use Extension" button that posts a pairing request. An unregistered extension maps to
exactly one list entry with `type: "extension"`, so `types === ['extension']`, so `b` is true, so
`open()` never runs. Symptom: tile present, click collapses the list, no frame posted, nothing logged
on either side. Temple escapes it only because Beacon's registry lists Temple as **both** an extension
and a web wallet, and `beacon-ui` merges registry entries **by name** — `types.length === 2`.

⇒ **No unregistered browser extension can be paired from this modal.** Nothing about the pong, id,
name or icon changes that.

**WORKAROUND, labelled as one.** `types` is built by pushing one entry per discovery answer, merged by
name, so the announce half sends **two**: the real `chrome.runtime.id` first, then the same name under
a derived id. The merged entry gets two types, the guard passes, the panel opens. The pairing request
carries `targetId = x.id` from the **first** entry of the merged group — hence the ordering, which is
asserted rather than assumed. `classifyPageFrame` also accepts a `targetId` that *starts with* this
extension's id, so pairing cannot fail silently if the dApp stamps the derived one; extension ids are
fixed-length, so nothing else can produce that prefix, and a `targetId` that merely *contains* it is
still ignored.

Cost: one phantom row in the dApp's `getAvailableExtensions()`. The modal still shows a single tile,
because the two answers merge by name. **Delete the block when beacon-ui stops gating on
`types.length`** — it is one `postMessage` plus its tests. The clean fixes are upstream in
`@ecadlabs/beacon-ui`, or one line in the dApp calling `client.sendPairingRequest(extensionId)`
directly.

### L4 — a locked wallet fails indistinguishably from a user rejection, and silently

The first connect attempt hit it: the vault was locked, so `handleBeaconRequest` returned
`4100 Wallet is locked` **before enqueueing anything**, the content script mapped that to
`ABORTED_ERROR` (the only honest option — Beacon defines no "locked" error), and the dApp surfaced
`AbortedBeaconError`. That is byte-identical to what a user pressing Reject produces. Meanwhile the
wallet showed nothing: no prompt, no window, no badge, because nothing was enqueued.

Measured timings from the two attempts: the locked refusal returned in **2.9 s**
(`makeRequest … 2893 ms`, essentially the transport round trip), the successful grant took **15.2 s**
(`makeRequest … 15228 ms`, dominated by the human reading the approval screen). Both are far inside
the dApp's `CONNECT_TIMEOUT_MS = 120_000`.

**NOT FIXED.** The fix is to open the wallet's unlock UI on a locked-vault dApp request, which is what
MetaMask and Temple both do — but it adds a capability this wallet does not currently have (a dApp
request causing a wallet window to appear), and that is a security decision for the owner, not a
detail to slip in. Recorded here so it is a decision rather than an oversight. The EIP-1193 path has
the identical behaviour and would want the same treatment.

### L3 — the loaded build was not the built build

`packages/wallet/dist` had been overwritten by a crxjs **dev** build, whose content-script loaders
import `vendor/vite-client.js` and need the Vite dev server. The repo also carries a checked-in
`wallet-dist/` at **v0.14.0 with no Beacon code at all** — which is what `TESTING.md` tells a tester
to load. Either presents as "the wallet is not in the modal". Not a code defect, but it cost a
diagnostic round trip, and `TESTING.md` pointing at a stale artefact is worth fixing separately.

### Refuted, for the record

Ten candidate findings did not survive verification, including: that `Client.prototype.init` skips
listener registration (Measured 6 disproves it); that a cross-origin iframe could obtain a grant
attributed to the top document (no `all_frames`, and the guard rejects it twice over — Measured 20);
that the peer list should be origin-scoped (contradicts a documented decision); and several
restatements of documented NOT-DONE items. One genuine pre-existing issue was correctly ruled **out of
scope**: a fail-open in `recordUnlockFailure` (`keyring.ts:589`), untouched by this diff — see §8.

---

## 5. Deliberate design decisions worth challenging in review

1. **The response states the wallet's network; the request's is checked, not echoed.** Echoing would
   leave the dApp's gate validating its own question. A request pinning a different `rpcUrl`, or any
   non-`custom` network type, is refused with `NETWORK_NOT_SUPPORTED` **before** prompting — a
   wrong-network request is the wallet's call, not a judgement to delegate to a dialog.
2. **No `StoredSession` for Beacon.** A `StoredSession` is what gates `eth_accounts`; writing one on a
   Beacon grant would hand the same origin EIP-1193 access it never asked for and the user never
   approved. Cost is §3.2/11. Regression-tested: after a granted Beacon connect, `eth_accounts` for
   that origin still returns `[]`.
3. **`operation_request` is granted as a scope although not yet served.** The scope describes what a
   dApp may *ask*; the wallet answers every ask, with an explicit error until milestone 2. Granting
   `[]` would make `DAppClient.checkPermissions` refuse dApp-side and block milestone 2 from being
   exercised. `sign` is withheld, which is the honesty that matters.
4. **`ConnectView` branches on `pending.protocol`.** It previously said "The site will see your
   EVM-visible address" and "Will receive: Your 0x address" unconditionally. Both are false for a
   Beacon connection, which hands over a tz1 and its public key.
5. **`requestId` is minted in the content script**, never taken from the dApp's message id — so a page
   can neither choose nor collide the approval queue's key. Asserted in `session.test.ts`.
6. **The Beacon protocol never enters `packages/core`.** The content script narrows a request to
   `{network, scopes}` before dispatch; core holds no `@airgap/*` import. Same seam the mobile shell
   uses for WalletConnect.

---

## 6. Suites

### 6.1 `packages/core/src/domain/__tests__/beacon.test.ts` — 22 tests

The pure verdicts, no SDK and no I/O. `WALLET_BEACON_NETWORK.rpcUrl` is asserted against the
**literal** previewnet URL as well as `TEZOS_L1_RPC`, so re-pointing the constant fails here rather
than quietly connecting a dApp to an endpoint it had refused.

| # | Test | Pins |
|---|---|---|
| 1 | reports the previewnet Michelson RPC verbatim | The single field the dApp gate decides on. |
| 2 | sourced from the constant `TezosSigner` injects through | The report cannot drift from where ops go. |
| 3 | declares a custom network type | A built-in `NetworkType` disagreeing with the peer earns `ParametersInvalidBeaconError`. |
| 4 | names the network | The dApp prints `name` beside the rpcUrl. |
| 5-9 | `sameRpcUrl`: trailing slash + case / query + fragment / different host / different path / unparseable | The normalisation is a copy of the dApp's `sameRpc`; if they differ, one side refuses what the other accepts. |
| 10-11 | accepts previewnet, both spellings | Happy path. |
| 12 | refuses a custom network pinned elsewhere | The 2026-08-19 incident: an issuance signed against Shadownet that failed only because the contracts were absent. |
| 13 | refuses `mainnet`/`ghostnet`/`shadownet` with no rpcUrl | §9 forbids those networks. |
| 14 | lets a request that pins nothing through | Refusing would block every dApp leaving the network to the wallet. |
| 15 | empty rpcUrl is "not pinned", not a match | `''` must not pass a truthiness check as agreement. |
| 16-18 | `sameRpcUrl` / `checkRequestedNetwork` / `grantScopes` do not **throw** on a wrong type | m1: core runs outside the router's try/catch; a throw answers nothing at all. |
| 19 | grants `operation_request`, withholds `sign` | Granting `sign` would make the dApp's gate lie for us. |
| 20-21 | grants nothing ungrantable / everything grantable when none named | Intersection at both extremes. |
| 22 | never invents a scope | No grant outside `BEACON_GRANTABLE_SCOPES`. |

### 6.2 `packages/wallet/src/composition/__tests__/sw-wiring-beacon.test.ts` — 15 tests

The SW's Beacon surface: real `Keyring` over an in-memory vault, real `ApprovalQueue`, decisions
resolved as the Approve surface would. No chrome, no network, no SDK.

| # | Test | Pins |
|---|---|---|
| 1 | rejects an unrecognized sender (4100) | The new surface clears the *same* guard, not a weaker one. |
| 2 | rejects the trusted-UI channel | The wallet's own UI must not mint itself a grant with no prompt. |
| 3 | rejects a stamped origin disagreeing with the host-verified one | Origin spoofing across the bridge. |
| 4 | enqueues nothing when the guard refuses | A refused request must not leave a prompt behind. |
| 5 | refuses while locked, without prompting | Consistent with the EIP-1193 path. |
| 6 | refuses a non-previewnet rpcUrl (5001) **before any prompt** | Wrong-network is the wallet's decision. |
| 7 | refuses a mainnet request (5001) | §9 guard rail, wallet-side. |
| 8 | surfaces 4001 on user reject | The decision reaches the dApp. |
| 9 | grants tz1 + `edpk` + our network + intersected scopes | The milestone, field by field. |
| 10 | marks the pending approval `protocol: 'beacon'` | Without it the prompt names the wrong address type. |
| 11 | session store untouched; `eth_accounts` still `[]` | Decision 2 — no cross-surface privilege escalation. |
| 12 | refuses a duplicate request id (-32602) | Queue entries immutable once enqueued. |
| 13 | applies the per-origin flood cap (-32005) | A looping page cannot stack prompts on the new surface. |
| 14 | refuses when the approved account was removed before the grant was built | Must not fall back to whichever account is active now. |
| 15 | resolves when the wallet locks mid-prompt | Auto-lock calls `rejectAll`; an in-flight request must answer, not hang. |

### 6.3 `packages/wallet/src/shared/beacon/__tests__/page-frames.test.ts` — 30 tests

Frame classification and the two outbound envelope shapes.

| # | Test | Pins |
|---|---|---|
| 1-3 | `TO_EXTENSION`/`TO_PAGE` match `ExtensionMessageTarget`; hand-off key matches | M2: this module is type-only against the SDK, so these literals are the only link left. A rename fails a test instead of making the wallet invisible. |
| 4-5 | answers the ping with and without a `targetId` | Discovery is a broadcast. |
| 6-8 | pairing addressed to us / to nobody / **to another extension** | Answering another extension's pairing is how three wallets become unanswerable. |
| 9-10 | encrypted message to us / to another extension | Same routing rule for traffic. |
| 11 | prefers `encryptedPayload` when both present | Deterministic classification. |
| 12 | ignores our own outbound frames | Same window, both directions. |
| 13 | ignores all four `TEZOSX_WALLET_*` tags | Three content scripts share one window. |
| 14 | survives non-object frames | The SDK posts the bare string `'extensionsUpdated'`. |
| 15-16 | ignores empty / non-string payloads | Page-supplied fields. |
| 17-18 | pong is **flat** and carries `name` | Nesting it = invisible wallet, no error. |
| 19-20 | transport frames are **nested** with `sender.id` | What the dApp's two readers require. |
| 21 | accepts what the SDK actually serializes (round trip) | Validated against the producer. |
| 22-23 | rejects a `publicKey` that is not 32 bytes of hex; accepts uppercase | It is fed to a cryptobox. |
| 24-26 | rejects wrong/missing `type`, `id`, `version` | Shape-checked. |
| 27 | tolerates a nameless dApp | Only ever displayed. |
| 28-30 | **clamps** `id`/`name`/`version` to 128; long names still pair; `publicKey` untouched | M1: a pairing is accepted with no prompt and persisted beside the encrypted vault. |

### 6.4 `packages/wallet/src/shared/beacon/__tests__/extension-post-message.test.ts` — 11 tests

The transport, checked against the SDK's own crypto. **This is the suite that would have caught the
shipped `WalletPostMessageTransport` being backwards** — a test asserting this module's own field
names would have passed for that class too. So the sealed pairing response is opened with
`openCryptobox` exactly as `listenForChannelOpening` does, and encrypted frames are decrypted by a
second `MessageBasedClient`, the base class the dApp end is built on.

| # | Test | Pins |
|---|---|---|
| 1 | reports `post_message` | The dApp refuses a ceremony over WalletConnect on this field. |
| 2 | seals a pairing response **the dApp can open with its own keypair** | Cryptobox + wire format, against the SDK's reader. Also `name`, echoed `id`, `version`. |
| 3 | no response when asked not to, peer still recorded | `sendPairingResponse: false` honoured without losing the peer. |
| 4 | persists under the **wallet** storage key | Writing the dApp's key would collide with a dApp on the same profile. |
| 5 | encrypts to the peer in a frame **the dApp can decrypt** | Round trip, SDK crypto both ways. |
| 6 | posts nothing with no peer | A frame is sealed to one key; a peerless broadcast must not go out in the clear. |
| 7 | reports **the peer's public key** as `connectionContext.id` | `respondToMessage` routes by it; anything else degrades to broadcast and answers the wrong dApp. |
| 8 | drops an undecryptable frame instead of throwing | Every peer is offered every frame; failure is normal. |
| 9 | two paired dApps never cross | Multi-dApp routing, positively. |
| 10 | ignores a frame from an unpaired peer | Only paired keys accepted. |
| 11 | `connect()` re-attaches a peer stored by an earlier page load | Without it the wallet goes deaf after every tab reload. Asserted before and after. |

### 6.5 `packages/wallet/src/shared/beacon/__tests__/session.test.ts` — 14 tests

Milestone 1 end to end over the real wire: a simulated dApp pairs, serializes a genuine **v2**
`permission_request` with the SDK's `Serializer`, encrypts it, posts it in; the answer is decrypted and
deserialized back with the same SDK before anything is asserted. The SDK's `WalletClient` and both
interceptors run for real.

| # | Test | Pins |
|---|---|---|
| 1 | narrows the request and **mints its own `requestId`** | Decision 5. Asserts the whole envelope. |
| 2 | answers a `permission_response` the dApp can decrypt | The milestone, over the wire. Also the acknowledge-then-answer ordering. |
| 3 | SDK fills in `senderId`/`version`/`appMetadata` | Proves the **v2 enriching branch** ran (Measured 7). |
| 4 | records the grant as a Beacon permission | The SDK's record stands in for a session. |
| 5 | user reject → `ABORTED_ERROR` | A real `Error` message with an `errorType`, not a thrown string. |
| 6 | wrong network → `NETWORK_NOT_SUPPORTED` | The typed error the dApp branches on. |
| 7 | EVM-source account → `NO_ADDRESS_ERROR` | Ditto. |
| 8 | locked wallet → `ABORTED_ERROR` | Coarse on the wire by design; reason logged. Must not leave the dApp waiting. |
| 9 | SW returns nothing → still answers | MV3 eviction / no listener. |
| 10 | relay throws → still answers | Nothing beneath a Beacon request carries a timeout. |
| 11 | `operation_request` → `UNKNOWN_ERROR`, nothing relayed | "Not built yet" ≠ "the user said no". |
| 12-14 | non-pairing payload ignored; non-bs58check rejects; undecryptable frame is a no-op | Page-supplied input. |

### 6.6 `packages/wallet/src/shared/beacon/__tests__/responses.test.ts` — 24 tests

The permission response, judged by a verbatim transcription of the dApp's own gate.

| # | Test | Pins |
|---|---|---|
| 1 | **PASSES the dApp network gate** | The connect verdict, run through the real judge rather than asserted. |
| 2 | produces exactly `<name> @ <rpcUrl>` | The third console line, character for character. |
| 3-4 | Beacon derives the same tz1 from our `edpk`; both fields present and valid | The tz1 approved is the tz1 shown. |
| 5 | `walletType: 'implicit'` | Beacon rejects `abstracted_account` for a non-KT1. |
| 6 | echoes the request id | How the SDK matches the pending request. |
| 7 | omits `senderId`/`version`/`appMetadata` | The interceptor injects them; setting them would override the correct values. |
| 8-9 | scopes emitted as SDK enum values; unknown scope dropped | No invented wire values. |
| 10-11 | `toSdkNetwork` maps `'custom'` → `NetworkType.CUSTOM`, carries name + rpcUrl | The re-labelling is exact. |
| 12-16 | error mapping: 4001 → `ABORTED`, 5001 → `NETWORK_NOT_SUPPORTED`, 5002 → `NO_ADDRESS`, everything else → `ABORTED`, and only ever a defined `BeaconErrorType` | Milestone 3's requirement. |
| 17 | a refusal is a real `Error` message | Not a thrown string. |
| 18-19 | narrows to network + scopes; **does not forward the page-chosen app name** | Origin identifies a site, not a name the page chose. |
| 20-24 | **drops** a non-string `rpcUrl`, a non-object network, a non-string `name`, non-array `scopes`; keeps only string scope entries | m1: these used to throw a `TypeError` in the SW outside any try/catch, so `sendResponse` never fired. |

### 6.7 `packages/wallet/src/content/__tests__/beacon-announce.test.ts` — 11 tests

The synchronous half, exercised by importing it for its side effects against a stubbed `window` and
`chrome`.

| # | Test | Pins |
|---|---|---|
| 1 | **registers its listener during module evaluation, nothing awaited** | M2: the whole reason the file is separate. |
| 2 | answers the ping with a **flat** pong carrying `sender` | What puts the wallet in the pairing modal. |
| 3 | answers with no SDK and no hand-off consumer | The announce path is independent of the lazy chunk. |
| 4 | uses the same hand-off key the SDK half reads | Keeps the duplicated literal honest. |
| 5 | buffers pairing then message, **in order**, answering neither | A pairing must reach the transport before the frames that follow. |
| 6 | hands straight to `onFrame` once installed, and stops buffering | Nothing delivered twice. |
| 7 | caps the buffer at 32 | M1: a page-driven buffer must not grow without bound. |
| 8 | ignores another window / another origin | The guard, both halves of it. |
| 9-10 | ignores EIP-1193 traffic, its own outbound frames, and non-object posts | Three content scripts, one window. |
| 11 | reuses an existing hand-off object | A reload must not orphan frames the other half is watching. |

### 6.8 `packages/wallet/src/adapters/chrome/__tests__/chrome-beacon-storage.test.ts` — 12 tests

Both properties here are security properties, not conveniences.

| # | Test | Pins |
|---|---|---|
| 1 | **never asks for the whole namespace** | The SDK's `ChromeStorage.get(null)` would drag the encrypted vault into a content script on every Beacon read. |
| 2-3 | returns stored values; returns the SDK default for a missing key | Behavioural parity with what the SDK expects. |
| 4 | hands out a **fresh** default array each time | The SDK reads a list, pushes, writes back; a shared default would let two reads accumulate. |
| 5 | leaves the wallet's own entries alone | No collision with `vault`. |
| 6 | `delete` calls `remove` | The SDK's writes `undefined` into the key instead. |
| 7-8 | caps the peer list and the app-metadata list at 25, keeping the most recent | M1. App metadata matters most: the SDK writes it before the SW sees the request. |
| 9 | caps by total bytes too | One oversized entry (an `appMetadata.icon` data URI) cannot fill the namespace. |
| 10 | writes an in-bounds list through untouched | No gratuitous rewriting. |
| 11 | never prunes a non-list key | A bound on the seed would corrupt it. |
| 12 | always completes the write | Pruning, not refusing: a rejected write would leave the SDK believing it had persisted. |

---

## 7. Gates

```
tsc --noEmit        relayer ✓  relayer/extension ✓  core ✓  wallet ✓        (0 errors)
eslint              0 errors, 10 warnings — all pre-existing, count unchanged
vitest              wallet 272 / 24 files · core 282 / 32 files · relayer 25 / 5 files
                    = 579 tests / 61 files passing   (was 440 / 53 — +139 / +8)
npm run build:wallet ✓  + content-script Buffer check (4 entries), mutation-tested
eager per-page cost 5.01 kB total  (was 147.21 kB at first cut)
lazy chunk          145.81 kB, reached only on a real pairing
```

## 8. NOT DONE — stated, not smoothed over

- **Connect is confirmed live; the ceremony is not.** The 2026-08-24 run establishes discovery,
  selection, pairing and the full permission grant against the real dApp (§3.1/22-27). It establishes
  **nothing past connect** — see the `operation_request` bullet below. Note also that the run required
  the beacon-ui workaround in §4.1/L2 to be selectable at all, so "it works" is conditional on
  carrying that workaround.
- **A locked wallet fails silently and indistinguishably from a user rejection** (§3.1/27, §4.1/L4).
  Confirmed live, not fixed. Every auto-lock puts the user back into it with no wallet-side signal.
- **AUTO-LOCK IS A CEREMONY HAZARD, and this needs deciding before milestone 2.** `AUTO_LOCK_IDLE_MS`
  is **5 minutes** (`packages/core/src/shared/constants.ts:55`), enforced by a 1-minute alarm, and
  `recordActivity` is stamped **only for `trusted-ui` traffic** — dApp traffic deliberately does not
  count (`service-worker.ts:122`). `autoLock` then calls `keyring.lock()`, `queue.rejectAll()`,
  `state.container = null` and `containerCache.clear()`. Consequences for a 23-op run:
  - approving each operation is `trusted-ui` traffic, so a user actively confirming ops keeps the
    wallet alive — the common path is fine;
  - but any single step that keeps the operator away from the wallet for >5 minutes auto-locks it,
    **rejecting every pending approval** and killing the run mid-ceremony;
  - and `chrome.idle` locks *immediately* on screen lock or system idle, regardless of the deadline.
  Untested against a real ceremony. Named now because a mid-ceremony abort after children have been
  paid for is the expensive failure, and it is a design decision (exempt an in-flight ceremony? stamp
  activity on approval resolution? raise the deadline while approvals are pending?) rather than a bug
  with an obvious fix.
- **Only one dApp, one browser, one profile.** Confirmed against `@ecadlabs/beacon-dapp`
  4.8.1-ecad.7 in Chrome with MetaMask also installed. Not tested against `@airgap/beacon-dapp`, a
  second Beacon wallet on the same page (§3.2/5), Firefox, or a fresh profile.
- **`operation_request` is not implemented** — answered with `UNKNOWN_ERROR`. No operation has been
  signed or injected over Beacon. Milestone 2.
- **`sign_payload` is not implemented and the `sign` scope is not granted.**
- **A Beacon connection cannot be revoked from the wallet UI** — no `StoredSession`, not in Connected
  sites, `DISCONNECT` does not reach it.
- **A locked wallet refuses silently.** The SW returns "Wallet is locked" without opening the unlock
  UI, so the operator sees an abort in the page console and nothing in the wallet. Matches the
  existing EIP-1193 behaviour; still a poor first-run experience.
- **Past 25 paired dApps, the oldest pairing is evicted** (and past 64 kB of peer or app-metadata
  records). Deliberate — §4/M1 — but a behaviour change a user could in principle notice.
- **The 23-op native ceremony is untouched** and no claim is made about it. Whether the `CALL_EVM_*`
  fixed-ceiling fallback covers Phase 2's large `%call_evm` payloads is unknown, and
  `sendContractCall` is still hardwired to `NAC_CONTRACT` — generalising it is milestone 2 work, and
  the fallback being keyed on `entrypoint === 'call_evm'` needs a deliberate decision once `to` can
  be something other than the NAC gateway.
- **Deferred, separate change:** a fail-open in `recordUnlockFailure` (`keyring.ts:589`) — it awaits
  `unlockGuard.save` inside the wrong-password catch, so a rejecting `set` propagates before
  `failedAttempts` is persisted and the throttle never arms. Pre-existing, untouched by this diff,
  and needs an attacker with local UI access. Found by the security lens; **not fixed here** because
  it is unrelated debt and belongs in its own change with its own test.
- **Also deferred:** a defence-in-depth `try/catch` on the service worker's dispatch listener. m1 was
  fixed at the boundary, but the EIP-1193 path has the same shape (`personal_sign` with `params`
  absent throws on `params[0]`), and `bridge.ts` forwards `data.args` unvalidated. Pre-existing.
