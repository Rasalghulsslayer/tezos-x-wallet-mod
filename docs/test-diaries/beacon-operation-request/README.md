# Test diary — Beacon `operation_request`, milestone 2

**Branch:** `feat/beacon-wallet-provider` · **Date:** 2026-08-24 · **Scope:** milestone 2 only
**Gates:** tsc 0 across relayer + relayer/ext + core + wallet + mobile · eslint 0 errors (10 pre-existing warnings, unchanged) · vitest **750 passing across 75 files** (587 / 61 after milestone 1, **+163 / +14**) · `npm run build:wallet` ✓ · eager per-page cost 5.1 kB
**Live run, 2026-08-24: THE FULL NATIVE CEREMONY RAN OVER THIS PROVIDER. 25 OPERATIONS, 25
APPLIED, ZERO FAILURES.** Levels 583133-583189, 4 min 18 s, counter 6 → 31 exactly — no reveal, no
retry, no stray operation. Six per-role originator calls minting six children, six `%call_evm`
deploys **declaring gas at this chain's hard limit exactly**, six `setAdmin` rotations on precisely
those six children, and seven wire writes. 3.272932 ꜩ spent. Every operation carried a complete
three-knob pin and every pin was honoured verbatim. See §2/21-27.

Preceded by the three probe rungs (§2/10-20), which are what made the ceremony worth attempting:
rung 3 proved a parameter reaches contract state, and rung 2 proved nothing it was built to prove,
for a reason worth reading (§2/14-15).
**Predecessor:** `../beacon-wallet-provider/README.md` (milestone 1, connect — live-confirmed 2026-08-24).

---

## 1. The finding that decided the design

The brief said "do not weaken `tezos-signer.ts`'s fee logic — it is calibrated to this chain
(mempool/filter + 1.5× + retry on `required`)". Reading the dApp showed that applying that logic to a
Beacon operation would be the **defect**, not the safeguard.

**Every operation the native ceremony sends arrives already priced.** There is no
`client.requestOperation` call anywhere in the dApp: all four op kinds go through
`tezos.wallet.transfer({...params, ...pin}).send()`, and the pin comes from a live
`tezos.estimate.transfer` on the dApp side. Measured across the four kinds:

| # | Phase | Destination | Entrypoint | fee µtez | gas | storage | priced by |
|---|---|---|---|---|---|---|---|
| A | 1 originate | per-role **originator KT1** | role-specific | 30 000 / 60 000 (token) | 6 100–9 500 | 1 428–12 304 | hardcoded measured table |
| B | 2 deploy | **gateway KT1** | `call_evm` | 500 000 | **660 000** | 10 000 | hardcoded (CREATE frame) |
| C | 3 rotate | **child KT1** | `setAdmin` | live | live | live | `pinFromEstimate` |
| D | 4 wire | **gateway KT1** | `call_evm` | live | live | live | `pinFromEstimate` |

Three distinct destination kinds — which is exactly why `sendContractCall`'s hardwired
`to: NAC_CONTRACT` had to be generalised.

**Why the pin must be honoured verbatim.** previewnet's fee floor couples the three knobs. From
`mempool/filter` (measured live 2026-08-24):

```
minimal_fees                  100
minimal_nanotez_per_gas_unit  45/1      → 0.045 µtez per gas unit   (450× mainnet)
minimal_nanotez_per_byte      4000/1    → 4 µtez per byte           (4000× mainnet)

required_µtez = 100 + 4 × opBytes + 0.045 × declaredGas
```

So the fee a dApp declares is derived *from* the gas it declares. Re-estimating either one leaves the
other unfunded, the node answers `evm_node.dev.insufficient_fees` at preapply, and Beacon surfaces a
generic abort. The dApp's own `native-op-params.ts` records this happening in both directions on the
same day — a hardcoded pin 964 µtez short of its own gas declaration, and then delegation to a wallet
that priced ~20% under the floor, which is what made Temple's confirm sheet vanish with no operator
action.

**Hence two modes, and no third:** a complete pin is submitted as given, with no estimate and no
retry; an absent pin falls through to the existing calibrated buffered-fee path. A *partial* pin is
treated as no pin at all — honouring one of three numbers is not a weaker version of honouring three,
it is a fee that no longer covers its own gas.

---

## 2. Measured

| # | Fact | How |
|---|---|---|
| 1 | previewnet's fee constants are `minimal_fees: 100`, `minimal_nanotez_per_gas_unit: 45/1`, `minimal_nanotez_per_byte: 4000/1`. | `curl $RPC/chains/main/mempool/filter?include_default=true`, 2026-08-24. |
| 2 | **`hard_gas_limit_per_operation: 660000`**, `hard_storage_limit_per_operation: 60000`, `cost_per_byte: 1`. | `curl $RPC/chains/main/blocks/head/context/constants`, same day. Note `hard_gas_limit_per_block` is *also* 660 000 — one operation can consume a whole block's gas. |
| 3 | **The wallet's own `CALL_EVM_GAS_LIMIT` is 1 040 000 — 1.58× the hard limit.** An operation declaring it cannot be included at any fee, so `submitWithFixedCeilings` can only ever fail on this chain. | Measurement 2 against `tezos-signer.ts:46`. **Reported, not changed** — see §5. |
| 4 | The ceremony's phase-2 deploy pin declares gas `660_000`, i.e. the hard limit **exactly**. So the guard on a supplied pin must be `>` and not `>=`. | The dApp's `NATIVE_DEPLOY_OP_PARAMS`; asserted in both new suites. |
| 4b | **Taquito's CONTRACT API passes a complete pin through untouched — verified, because the dApp's own notes warn about this exact path.** `native-op-params.ts` says the "estimates all three and OVERWRITES the pinned fee" behaviour "describes the **contract/signer** API", and `TezosSigner` uses `toolkit.contract.transfer`. `rpc-contract-provider.js:233` does always call the estimate gate, but the gate itself (`provider.js`) is `if (fee === undefined \|\| gasLimit === undefined \|\| storageLimit === undefined) { … }` and fills only with `??=`. So the estimator runs ONLY when a knob is absent; all three supplied are returned unchanged. The warning is real but conditional — and it is precisely why a **partial** pin must be treated as no pin: a partial pin WOULD reach the estimator, and `??=` would then pair the dApp's fee with Taquito's gas, the mismatched combination the dApp documents as its 964 µtez defect. | `node_modules/@taquito/taquito/dist/lib/provider.js`; `contract/rpc-contract-provider.js:220-240`. That gate also throws `InvalidEstimateValueError` on a decimal knob, which `checkOperation`'s `Number.isSafeInteger` already refuses. |
| 4c | `transferWithBufferedFees` also supplies all three to `contract.transfer` (fee computed, gas and storage from its own estimate), so the unpinned path does not estimate twice. | Same gate, read against `tezos-signer.ts`. |
| 10 | **AN OPERATION SIGNS AND INJECTS OVER BEACON.** `ooSKHnYeFQ7xxbnyNcJdWahguc7pnbfpW1QmhxdTHBucQuaVtuf` (level 582527) and `oo6GEebKnbWcNYv5AMAk3Y4xrLMxq2iEmNtp1xp4dhyqBaTgb5M` (level 582530), both `status: applied`, sender = target = `tz1cCWjCcVi4bbAbnrsHwbBiqVJcSVTaaSEb`, `amount: 1` mutez. | TzKT `/v1/operations/<hash>` — read independently of what the wallet or the dApp reported, which is what makes it evidence. |
| 11 | **THE PIN IS HONOURED TO THE MUTEZ, ON CHAIN.** Declared `fee 20000 / gas 10000 / storage 100`; chain recorded `bakerFee: 20000`, `gasLimit: 10000`, `storageLimit: 100`, `gasUsed: 2149`, `storageUsed: 0`, `storageFee: 0`. Had Taquito re-estimated, a plain transfer prices at ~797 µtez — 25× lower — so the estimate gate provably did not run. This is Measured 4b, previously established only by READING `provider.js`, now observed. And `gasUsed: 2149` matches the dApp's own documented measurement of a plain transfer exactly. | Same TzKT read. |
| 12 | **The balance delta confirms it a second way, without the indexer.** 39 998 694 → 39 958 694 mutez = **exactly −40 000**, i.e. 2 × the declared 20 000 fee, with the 1 mutez self-transfer netting zero and no storage burn. Counter 2 → 4: two operations, and NO reveal was prepended (the account was already revealed), so the reviewer's "is a 660 000-gas op included when a reveal is prepended" question is still open. | `contracts/<tz1>/balance` and `/counter` via `head`. |
| 13 | **`parameter: None` on chain** — rung 1's claim was that the field is ABSENT from what Beacon serialises, and `buildParams` omits it rather than sending an empty object. Confirmed on the wire, not just in a unit test. | Same TzKT read. Taquito forges an empty `parameter` differently, so this distinction is real. |
| 14 | **RUNG 2 PROVED THE PIN A SECOND TIME AND THE PARAMETER PATH NOT AT ALL.** `op5cT9D1PGFWxP9845p35FKW5K3g2LD1WoQr9PiJfyAQgzWAprZ` (level 582660), `applied`, `bakerFee: 20000` against the declared `fee 20000 / gas 10000 / storage 100`, 2 148.528 milligas consumed, balance 39 958 694 → 39 938 694 = exactly −20 000, counter 5. **And `parameters` ABSENT from the signed operation** — the rung sent `{entrypoint: 'default', value: {prim: 'Unit'}}`, the wallet logged `default`, and the chain recorded a bare transfer. | The node's own record of the signed bytes, `/chains/main/blocks/582660/operations`, not just TzKT's `parameter: null` — an indexer may normalise, the node's re-serialisation of what was signed may not. |
| 15 | **THE FORGER STRIPS `(default, Unit)`, AND THAT IS CORRECT.** `parametersEncoder` opens `if (!val \|\| (val.entrypoint === 'default' && 'prim' in val.value && val.value.prim === 'Unit')) return '00'` — `'00'` being the protocol's *no parameters* tag. `(default, Unit)` **is** the canonical encoding of "no parameter"; the two forge to identical bytes and are the same operation. So rung 2 sent the one parameter in existence that is indistinguishable from none, and **its `unit-param` rung can never show a parameter on chain** — a property of the ladder, not of this wallet. | `@taquito/local-forging/dist/lib/codec.js:390-393`. Chain of custody for *which* forger: the wallet sets none, `TezosToolkit.setForgerProvider` falls back to `TaquitoLocalForger` (`taquito.js:175`) and `Context` defaults to it (`context.js:61`). **The fact was already recorded in `tezos-signer.test.ts` before the rung was chosen** — the `cannot express an entrypoint without a value` test names `default` as "the one name for which omitting the parameter is semantically exact" — and was not applied. Now pinned by two tests so the trap sits where someone would next fall into it. |
| 16 | **RUNG 3: MICHELINE REACHED THE CHAIN.** `oohRH3RtUQ9YDdCLv4yYy2U1K7LGEhmTb3Uem6RMNu8rgeaz9Ce` (level 582767), `applied`, destination `KT1BTZYrgCKfLhpA8j3AtgN75MFKjekZ61wx` (the live `ctr` originator), `amount: 0`, counter 6. The signed operation **carries a `parameters` key**: `entrypoint: "default"`, `value` a `Pair` whose first argument is `bytes` decoding to `beacon-probe-1787584451506-du4myd`. This is the first parameter this wallet has put on chain over Beacon, and the entrypoint that made it observable is the *same* `default` rung 2 used — only the value differs, which is exactly what Measured 15 predicts. | Node record as above. `default` and not `deployInstance` because LIGO collapses a single-`[@entry]` sum type to a bare root comb, so the named entrypoint does not survive compilation — the dApp's own note, confirmed by the chain accepting `default`. |
| 17 | **AND IT WAS INTERPRETED, NOT MERELY CARRIED.** The call originated a real child, `KT19XzSZrJX1mNh4NNs5Za9JPcQm7VYf6pyc`, as an **internal** origination (`status: applied`) — the `create_contract` runs inside the originator, so the child arrives on the internal result and `originated_contracts` on the outer result is `None`. The child's storage reads `Pair [1] (Pair 0000b5a6… 01d1d30c…)`, which decodes to topics `[1]`, admin `tz1cCWjCcVi4bbAbnrsHwbBiqVJcSVTaaSEb`, owner `KT1TiDcrFkRPEJJLkQ3D4tvuzNLJAByejzQx` — **byte-identical to the admin and owner inside the Micheline that was signed**. A parameter can be carried and ignored; this one became state. | `contracts/KT19XzSZ…/storage` via `head`; addresses decoded with `encodeAddress` from `@taquito/utils`. This is the strongest form of the proof available without running the ceremony. |
| 18 | **THE PIN HELD ON A CONTRACT CALL TOO, AND THE OPERATOR'S CEILING BOUNDED THE REAL SPEND.** Declared `fee 30000 / gas 6100 / storage 1428`; chain recorded `fee: 30000` exactly (third confirmation). Consumption: 1 698.308 milligas outer + 2 337.936 internal = **4 037 gas units** of the 6 100 declared. Storage: 92 bytes outer + 879 internal + **257 for the contract allocation** = **1 228 bytes** of the 1 428 declared. Balance 39 938 694 → 39 907 466 = **−31 228** = 30 000 + 1 228, against the **31 428** ceiling the approval screen states. Ceiling ≥ actual, with 200 mutez of headroom. | `origination_size: 257`, `cost_per_byte: 1` from `context/constants`. **My own prediction was 257 short** — I forecast −30 971 from the two `paid_storage_size_diff` figures and forgot the fixed allocation burn. `maxOpCostMutez` needs no change: the allocation is charged against the storage *limit*, so `amount + fee + storageLimit × cost_per_byte` already contains it. The formula was right where the hand-prediction was not. |
| 19 | **RUNG 3'S PAYLOAD IS 5.5× SMALLER THAN ITS OWN LABEL CLAIMS, so "large Micheline" is still untested.** The rung is labelled *"Pair `<issuance_id>` `<ctr birth storage>` (1,336 B)"*. Measured on the wire: the parameter value is **242 characters** of compact JSON (275 including the entrypoint), and the whole operation forges to **230 bytes** unsigned, **294** with a signature. Nothing here approached the preview's 512-character truncation threshold, a multi-chunk Beacon frame, or the ~2.5 kB op the dApp's fee notes discuss. | Value re-serialised from the node's record; forged size measured by running `localForger.forge` over the block's own `branch` + `contents`. Consequence in §8. |
| 20 | **The fee the ceremony pins is ~19× this chain's floor.** For rung 3: `100 + 4 × 294 + 0.045 × 6100` = **1 551 mutez** required, 30 000 paid. Not a defect and not this wallet's call — the dApp priced it and the operator approved it — but it means the pin's *safety margin*, not its accuracy, is what the three live rungs have demonstrated. A pin that is 19× the floor would survive a good deal of forging drift, so these rungs do **not** show that a tightly-priced pin survives. | Measured 1 + Measured 19, using the signed size. |
| 21 | **THE 25-OPERATION CEREMONY RAN END TO END OVER THIS PROVIDER.** Levels 583133 → 583189, `applied` 25/25, counter 6 → 31 — exactly 25 increments, so no reveal was prepended, nothing was retried and nothing else was signed. Phase 1: six originator calls (`default`, params 206-576 chars, fees 30 000 ×5 and 60 000). Phase 2: six `%call_evm` to `KT18oDJJ…`. Phase 3: six `setAdmin`. Phase 4: seven `%call_evm`. | TzKT `/v1/operations/transactions?sender=<tz1>&level.gt=582767`, plus `contracts/<tz1>/counter` via `head`. Note the count is **25**, not the 23 the brief describes. |
| 22 | **A LARGE PAYLOAD IS NOW PROVEN, AND IT IS ~66× RUNG 3's.** The phase-2 deploys carry Micheline of 23 151 / 25 263 / 27 055 / 28 911 / 31 983 / **38 703** characters. The dApp's own forge measurement puts the deploy op at **19 543 bytes** including signature (`native-op-params.test.ts:43`) against rung 3's 294. So the whole route — page → content script → service worker → `submitWithLimits` → chain — carries a 38 kB parameter intact, and `summariseMicheline`'s 512-character truncation was exercised on 13 of the 25 operations rather than on none. §8's first NOT-DONE item is retired. | Parameter sizes re-serialised compact from TzKT's `parameter.value`. What is proven is end-to-end integrity, since the gateway executed the initcode and the result was `applied`; whether the Beacon frame was internally chunked is not something these reads can see, so it is not claimed. |
| 23 | **GAS DECLARED AT THE HARD LIMIT EXACTLY, SIX TIMES, ALL INCLUDED.** Each phase-2 deploy declares `gasLimit: 660000` — `hard_gas_limit_per_operation` to the unit — with `fee: 500000`, and consumed 52 965-88 956. This is the live confirmation of Measured 4: the guard on a supplied pin had to be `>` and not `>=`, and `checkOperation` would have refused all six had it been `>=`. | Same read. Also settles the reviewer's open question in the other direction: an operation may declare a whole block's gas allowance and still be baked. |
| 24 | **ALL 25 ARRIVED PINNED, SO THE PINNED BRANCH RAN 25/25 AND THE BUFFERED BRANCH RAN 0/25.** The non-round fees (1 489-5 369 on phases 3-4) are *not* wallet estimates — the dApp computes a complete pin per operation via `priceOp` → `pinFromEstimate`, returning `PinnedOpParams` with all three knobs `readonly`, and logs `"estimated live, because the wallet under-prices this chain"`. `PRICE_LIVE` names *the dApp* doing the estimating, not the wallet (`executor-taquito.ts:1066`). | `executor-taquito.ts:995-1035`, `native-op-params.ts:103-107`. **This corrects an inference drawn from fee shape alone**, which read the varying fees as evidence of the wallet's own buffered path. It confirms §1: the ceremony arrives priced. It also means `removeDefaultParams` stripped nothing — no knob was falsy on the wire, the smallest `storageLimit` being 100. |
| 25 | **THE SEQUENCE'S INTER-OPERATION STATE HELD.** Phase 1 minted six children as **internal** originations — `KT1VbF5a…`, `KT1BWugX…`, `KT1D8RQc…`, `KT1XgdxV…`, `KT1Hviuu…`, `KT1FaYv5…`, one per originator, all `applied`. Phase 3's six `setAdmin` calls target **exactly those six addresses**, each matched to its minting level. So the wallet did not merely sign 25 independent operations: it signed a dependent chain in which later operations address contracts that earlier ones brought into existence. | `/v1/operations/originations?initiator=<tz1>` cross-referenced against the phase-3 targets. Eleven internal originations in total; the five at levels 583183-583188 are gateway internals sent by `tz1Ke2h7…`, not ceremony children. |
| 26 | **13 DISTINCT DESTINATIONS, ONLY 12 OF 25 TO THE NAC GATEWAY.** Six originators, six children, one gateway. `sendContractCall`, hardwired to `to: NAC_CONTRACT`, could have expressed 12 of the 25; the generalisation the brief demanded is what carried the other 13. | Same read. The trap named in the brief, measured. |
| 27 | **Total spend 3.272932 ꜩ**: 3 247 173 µꜩ of `bakerFee` plus 25 759 µꜩ of storage burned (1 µꜩ/byte, including the internal originations' allocation). Balance 39 907 466 → 36 634 534. | `contracts/<tz1>/balance` via `head`, reconciled against the summed per-operation fees. |
| 5 | No `client.requestOperation` call site exists in the dApp; every operation is Taquito `wallet.transfer`. `BeaconWallet.removeDefaultParams` deletes each knob whose value is falsy **independently per field**, so a supplied knob reaches the wallet intact and an absent one is absent. | dApp `grep` (0 hits for `operationDetails`/`requestOperation` outside comments); `taquito-beacon-wallet.js:211-224`. |
| 6 | Beacon sends the three knobs as decimal **strings** — Taquito's `createTransferOperation` stringifies them — so they are parsed, and only accepted as a complete finite non-negative set. | `narrowOperationRequest` / `readLimits`, asserted in `session.test.ts`. |
| 7 | **Two stale comments in the dApp** claim the rotate and `call_evm` paths are "DELEGATED TO THE WALLET, EXPLICITLY". The code above them spreads `...rotatePin` / `...pin`. The code is authoritative; the comments predate the fix. | `executor-taquito.ts:1527-1533` and `:1553-1565` versus `:1522-1540` and `:1066`. Worth a one-line fix in that repo, which is read-only here. |
| 8 | `TezosSigner` is the **only** implementor of `TezosSignerPort`; `sendContractCall` on the wallet side has exactly one caller (`RelayerProvider`), `sendNativeTransfer` exactly one (`send-transfer`). So the generalisation could not disturb another implementor. | repo-wide grep. |
| 9 | The Connections UI — both shells — reads only `origin`, `accountId` and `connectedAt` off a `StoredSession`, never `evmAlias` or `chainId`. That is what made a Beacon session storable without touching either UI. | `connections-vm.ts`, `pages/Connections.tsx`, `mobile/screens/Connections.tsx`. |

---

## 3. Two bugs found while building this, both mine to avoid

### B1 — a Beacon grant would have authorised EVM signing

Milestone 1 deliberately wrote no `StoredSession`. Milestone 2 needs origin-keyed state that survives
service-worker eviction, so it writes one with `protocol: 'beacon'`. That immediately created two
escalation paths, because the EIP-1193 side looks sessions up by origin alone:

- `eth_accounts` would have returned the account's EVM alias to a Beacon-only origin;
- `requiresSession` would have let `eth_sendTransaction` and `personal_sign` through for it.

Both now filter `protocol !== 'beacon'`, and a Beacon session stores an **empty** `evmAlias` so that
even a mistake in the filter discloses nothing rather than an address. Three tests pin it, including
the mirror case: an EIP-1193 session does not authorise `operation_request` either.

### B2 — one origin could hold only one session, so connecting twice revoked a grant

Both session stores keyed on `origin` alone. The MAPS dApp legitimately connects over **both**
surfaces — it has an EVM path and a native path — so the second connect would have silently
overwritten the first, revoking a grant the user had given without telling either side.

Identity is now `origin + protocol`, via a `sessionIdentity` helper in the port so the two adapters
cannot disagree. The EIP-1193 identity is the bare origin, so **every session written before Beacon
existed keeps its key and no migration is needed**. `remove(origin)` deletes every protocol's session
for that origin, which is what Disconnect means.

---

## 4. Deliberate decisions worth challenging

1. **The `call_evm` fixed-ceiling fallback is NOT reused on this path**, even when the entrypoint is
   `call_evm`. The brief asked for a deliberate answer; here it is, in order of weight: the caller has
   already priced the operation against the live chain, so overriding its pin after a simulation
   failure substitutes a guess for a measurement; the ceiling is 1.58× the chain's hard gas limit and
   cannot be included at any fee (Measured 3); and it was calibrated for the NAC gateway, whose kernel
   provisions an inner EVM frame from the declared L1 limit — a property no per-role originator or
   child KT1 shares.
2. **One operation per request.** `operationDetails` is an array and Beacon permits a batch. A batch is
   refused with the SDK's own `TOO_MANY_OPERATIONS` rather than signing the first and reporting
   success for all of them. Non-`transaction` kinds are refused with `PARAMETERS_INVALID_ERROR`.
3. **The signing account is the SESSION's, not the active one.** A user who switches accounts
   mid-session must not have a dApp's operation silently re-pointed. Mirrors `pinnedAccountId` on the
   EIP-1193 path, and is the property most worth a test here.
4. **Validation happens before the prompt.** Every field is page-supplied JSON the SDK does not check.
   An operator should never be asked to confirm an operation that cannot be submitted, and a malformed
   amount must not reach Taquito where `Number('1.5e3')`-style input silently misprices.
5. **A new `PendingTezosOperation` kind, not a reuse of `PendingTransaction`,** whose `to`/`value`/`data`
   are EVM-shaped. Filling EVM fields with Michelson values would make the approval screen name an
   operation other than the one being signed.
6. **The approval screen does not decode the parameter.** The destination is arbitrary and the wallet
   has no ABI for it, so raw Micheline is shown, truncated at 512 chars and labelled raw. A friendly
   summary would be a claim it cannot stand behind.
7. **A spend ceiling is shown only for a pinned operation** — `fee + storageLimit × cost_per_byte`,
   the most it can cost. For an unpinned one the screen says the cost is not yet known instead of
   inventing a figure, because a consent number that can be exceeded is not consent.
8. **An approved-then-failed operation maps to `BROADCAST_ERROR`, never `ABORTED_ERROR`.** The operator
   confirmed it; reporting an abort would blame them for a simulation refusal. `NOT_GRANTED_ERROR` for
   "never connected", so a dApp can tell that from "the user said no" — only one of the two is fixed
   by connecting.

---

## 5. Reported, not changed

**`CALL_EVM_GAS_LIMIT = 1_040_000` in `tezos-signer.ts` cannot produce an includable operation on
previewnet** (Measured 3). It is reachable only from `sendContractCall`'s `call_evm` fallback, after
the primary estimate has already failed with `tezlink_error` — so today that path fails, and clamping
it to 660 000 could only improve matters (its 100 000 µtez fee covers the resulting
`100 + 4×291 + 0.045×660 000 = 30 964` floor 3.2× over).

Left alone because it is on the EIP-1193 gateway path, which is out of milestone 2's scope and is the
only working path today. `domain/__tests__/tezos-operation.test.ts` carries a test asserting that this
exact figure is refused, so the number cannot be reused on the Beacon path by accident.

---

## 6. Suites

### 6.1 `packages/core/src/domain/__tests__/tezos-operation.test.ts` — 19 tests

The pure rules. No SDK, no I/O, no Taquito.

| # | Test | Pins |
|---|---|---|
| 1 | the chain limits match previewnet | Literals, so a chain change fails a test instead of letting an unincludable operation through. |
| 2-4 | accepts every destination kind the ceremony targets; tz2/tz3/tz4; refuses non-addresses | `sendContractCall` was hardwired to one destination; this path takes three kinds. |
| 5-7 | amount must be a non-negative integer string; refuses `1.5`/`-1`/`1e6`/`0x10`/whitespace; refuses > 2^53 | `Number(amount)` reaches Taquito, where a non-numeric string becomes `NaN`. |
| 8-10 | accepts the ceremony's entrypoints; absent = plain transfer; refuses spaces, `%`-prefix, over-length | Page-supplied. |
| 11-12 | absent pin is fine; **all four live ceremony pins are accepted**, including the deploy at the gas cap exactly | Measured 4 — the guard must be `>`, not `>=`. |
| 13 | refuses gas above 660 000, naming the limit | An operation that cannot be included at any fee must not reach a prompt. |
| 14 | **refuses the wallet's own `CALL_EVM_GAS_LIMIT`** | §5 — the figure cannot be reused here by accident. |
| 15-16 | refuses storage above 60 000; refuses negative, fractional, `NaN`, `Infinity` knobs | Complete-set validation. |
| 17-19 | `maxOpCostMutez` is fee + whole storage allowance; excludes gas; matches the live deploy pin (510 000 µtez) | The consent ceiling, not an estimate. |

### 6.2 `packages/core/src/adapters/tezos/__tests__/tezos-signer.test.ts` — 16 tests

**The most important suite in this milestone.** Taquito is mocked, because the alternative is
injecting operations against previewnet from a unit test.

| # | Test | Pins |
|---|---|---|
| 1 | a pinned operation submits the pin **byte-for-byte** | The whole design. Asserts the exact `TransferParams`. |
| 2 | **runs NO estimate** | An estimate here replaces the dApp's measurement with the wallet's guess, and the two are not interchangeable on this chain. NOTE: Taquito is mocked, so this asserts that the signer SUPPLIES all three knobs — Taquito's own guarantee that it then skips the estimator is established by reading `provider.js` (Measured 4b), not by this test. |
| 3 | does not add the buffered path's `+1` storage byte | A pin is a pin. |
| 4 | **does not retry** on failure | The buffered path retries on the node's `required`; doing that to a pin would spend more than the operator approved. |
| 5 | accepts the live deploy pin at the gas cap exactly | Measured 4. |
| 6-7 | refuses over-cap gas / storage **before submitting anything** | Fail closed, with the limit named. |
| 8 | an unpinned operation prices through the buffered path (fee = ⌈suggested × 1.5⌉, storage + 1) | The calibrated path is untouched. |
| 9 | **estimates the SAME operation it submits** | The "price op A, sign op B" divergence, made unrepresentable. |
| 10 | targets an arbitrary destination — originator, child, tz1 | The trap this method exists for. |
| 11-12 | omits `parameter` entirely for a plain transfer, and when an entrypoint has no value | Taquito expresses "no entrypoint" by absence; an empty object forges differently. |
| 13 | sends mutez, never XTZ | |
| 14 | **`sendContractCall` still targets the NAC gateway and still prices through the buffered path** | Its callers depend on both. Generalising must not have moved it. |
| 15 | passes `(default, Unit)` through to Taquito **even though the forger will drop it** | Added after the live rung 2 (Measured 14-15). What this layer owes is to hand Taquito what the dApp sent; the normalisation below it is not ours to prevent — but the header comment records it in full so the next person does not design the same unobservable probe. |
| 16 | passes a **non-`Unit` `default`** parameter through — rung 3's shape | The case that IS observable, since the strip needs both clauses. Asserts the exact pin `30000 / 6100 / 1428` alongside it. |

### 6.3 `packages/wallet/src/composition/__tests__/sw-wiring-beacon.test.ts` — 28 tests (+13)

The router. The container seam is stubbed so the post-approval signing path is assertable without a
network.

| # | Test | Pins |
|---|---|---|
| 1 | refuses an origin that never connected (5003), **without prompting** | The EIP path's `requiresSession`, mirrored. |
| 2 | refuses an origin whose only session is EIP-1193 | B1's mirror: an EVM grant is not permission to sign Michelson. |
| 3 | refuses seven malformed operations before prompting, and signs nothing | Decision 4. |
| 4 | 4001 on reject, and **nothing signed** | |
| 5 | the approval screen carries destination, entrypoint, amount, limits, the 15 000 µtez ceiling and raw Micheline | Decisions 5-7. |
| 6 | **no ceiling shown for an unpinned operation** | Rather than inventing one. |
| 7 | approve → op hash, **with the limits intact** in the signer call | The design, end to end through the router. |
| 8 | **signs with the account the SESSION was granted with, not the active one** | Decision 3. Switches the active account first, then asserts the container was built for the granted id. |
| 9 | an approved-then-failed injection maps to 5004, not to a user rejection | Decision 8. |
| 10 | the per-origin flood cap applies to operations too | |
| 11 | the sender guard clears first | |
| 12-14 | (permission) a Beacon session **is** written and is revocable; it does **not** satisfy `eth_accounts`; it does **not** satisfy the `eth_sendTransaction` gate | B1. These three replace milestone 1's "writes no session" test, which milestone 2 deliberately reverses. |

### 6.4 `packages/wallet/src/shared/beacon/__tests__/session.test.ts` — 21 tests (+7)

End to end over the real Beacon wire: a simulated dApp serializes a genuine v2 `operation_request`
with the SDK's own `Serializer`, encrypts it, and the answer is decrypted and deserialized back
before anything is asserted.

| # | Test | Pins |
|---|---|---|
| 1 | relays a pinned transaction with its limits **parsed from Beacon's decimal strings** | Measured 6. Asserts the whole narrowed envelope. |
| 2 | answers with `transactionHash` = the L1 op hash | The dApp calls `op.confirmation(1)` on it, so it must be a real injected op. |
| 3 | **a half-supplied pin is treated as no pin at all** | The knobs are coupled; honouring one of three is worse than honouring none. |
| 4 | refuses a **batch** with `TOO_MANY_OPERATIONS` and relays nothing | Decision 2. |
| 5 | refuses a non-`transaction` kind and relays nothing | Decision 2. |
| 6-7 | not-connected → `NOT_GRANTED_ERROR`; approved-then-failed → `BROADCAST_ERROR` | Decision 8. |
| 8 | `sign_payload` is still refused with `UNKNOWN_ERROR` | Not served, and answered rather than left hanging. |

### 6.5 `packages/wallet/src/shared/beacon/__tests__/responses.test.ts` — 27 tests (+3)

The error map gained `NOT_GRANTED_ERROR` (5003), `BROADCAST_ERROR` (5004) and
`PARAMETERS_INVALID_ERROR` (-32602); `-32602` no longer falls through to `ABORTED_ERROR`.

---

## 7. Gates

```
tsc --noEmit        relayer ✓  relayer/extension ✓  core ✓  wallet ✓  mobile ✓  (0 errors)
eslint              0 errors, 10 warnings — all pre-existing, count unchanged
vitest              wallet 324 / 25 files · core 321 / 34 files · relayer 25 / 5 files
                    mobile 80 / 11 files
                    = 750 tests / 75 files passing   (was 587 / 61 — +163 / +14)
npm run build:wallet ✓  incl. the content-script Buffer gate
eager per-page cost 5.1 kB (unchanged) · lazy chunk 148 kB
```

## 8. NOT DONE — stated, not smoothed over

- **THE UNPINNED BRANCH HAS NEVER RUN LIVE.** The ceremony arrived pinned 25 times out of 25
  (§2/24), so `transferWithBufferedFees` on the Beacon path is still argued from unit tests only —
  as is `checkOperation`'s `limits == null` acceptance. This is the mirror image of what was
  expected: the branch thought to be the default is the one with no live history. Any dApp that
  omits a knob, or supplies a falsy one for `removeDefaultParams` to strip, lands there.
- **A tightly-priced pin has not been tested.** The narrowest margin across all 29 live operations
  was ~1.45× this chain's floor (phase-3 `setAdmin`); the probe rungs paid ~19× (§2/20) and the
  phase-2 deploys ~7.6×. Honouring a generous pin is easier than honouring a tight one, and the
  dApp's own notes record a pin that was 964 µꜩ short and would have been refused at the
  prevalidator. Nothing here says the pass-through is exact enough for that case.
- **Not one approval screen has been read back, across 29 signed operations.** Predicted ceilings
  were 20 101 µꜩ (rungs 1-2) and 31 428 (rung 3); the chain confirms rung 3's spend stayed under it
  (31 228 ≤ 31 428, §2/18), which is the property that matters. But every figure the operator
  actually SEES — the ceiling, the `%default` entrypoint row, the truncated Micheline block, the
  purple Michelson badge — is a UI fact no chain read reaches. §3/M2's fix remains unobserved, and
  13 truncated previews were rendered without anyone confirming what they looked like.
- **My rung-3 spend prediction was 257 mutez short** — the fixed `origination_size` allocation burn,
  omitted from the forecast though not from the code (§2/18). And an inference from fee shape alone
  read the ceremony's phases 3-4 as unpinned; reading the dApp's source corrected it (§2/24). Both
  recorded because the forecast was the falsifiable half of the exercise.
- **Auto-lock was not exercised, it was merely outrun.** The whole ceremony took 4 min 18 s against
  an `AUTO_LOCK_IDLE_MS` of 5 min, so the hazard never had time to fire. Nothing was learned about
  it. A run with one 5-minute pause — a phone call, a screen lock, an operator reading a 38 kB
  parameter carefully — still meets `queue.rejectAll()` mid-ceremony. It now SAYS SO (§9), but it
  still ends the run. **This is the largest untested risk in the path**, precisely because the
  successful run says nothing about it.
- **The recovery paths are still untested.** 25/25 applied means no operation was rejected, aborted,
  re-priced or resumed. Every failure branch — `confirmApplied` on a failed `setAdmin`, a mid-run
  reject, a spent issuance id — is unobserved.
- **`AUTO-LOCK IS STILL A CEREMONY HAZARD`, and only its DIAGNOSIS is addressed.**
  `AUTO_LOCK_IDLE_MS` is 5 minutes and only `trusted-ui` traffic defers it; `autoLock` calls
  `queue.rejectAll()`. Approving each op does defer the deadline, so the common path survives — but
  any step that keeps the operator away for >5 min kills the run, and `chrome.idle` fires the moment
  the screen locks regardless of how recently they approved. §9 makes the failure legible; it does
  not make the ceremony survive it. Deferring auto-lock while the queue is non-empty would, and that
  trades a security property for an availability one, which is the operator's call and not the
  wallet author's.
- **On the BEACON wire a locked wallet is still indistinguishable from a user rejection** (milestone
  1 §4.1/L4). Fixed as far as the protocol allows — see §9 — but Beacon's enum has no locked-wallet
  member, so a Beacon dApp still receives `ABORTED_ERROR` for both. Only the wallet's envelope, its
  log, and the EIP-1193 code now separate them.
- **`sign_payload` is not implemented** and the `sign` scope is still not granted.
- **Batches are refused, not supported.** If the ceremony ever batches, this needs revisiting.
- **The `CALL_EVM_GAS_LIMIT` defect is reported, not fixed** (§5).
- **No reviewer pass on this milestone yet.** Milestone 1's found a blocker in the build artefacts
  that every green test missed; this milestone has had no equivalent scrutiny.

---

## 9. The abort/rejection split — fixed

**A wallet-side abort was reported as a user rejection on every dApp surface.** `rejectAll` resolved
`'reject'` — the exact value the Reject button produces — so a lock, a reset or a service-worker
suspend answered `4001 / "User rejected the request"`. Two costs, and the second is the expensive
one: it is a false statement about the operator, and it points whoever is debugging a stalled
ceremony at the dApp instead of at the lock.

**`Decision` now has a third case**, `{ aborted: reason }`, carrying the trigger with it — the queue
that knew why is already flushed by the time a consumer reads the outcome. `rejectAll` resolves that
instead of `'reject'`.

**Every consumer was switched from a blacklist to a whitelist.** The three call sites tested
`decision === 'reject'`; a new third case would have fallen straight through to the approved path,
which is the one mistake here that spends money. They now test `!== 'approve'` and hand off to a
shared `refusalFor`, so any decision that is not an approval is a refusal by construction.

**What a dApp sees now:**

| surface | user rejected | wallet aborted |
|---|---|---|
| EIP-1193 | `4001` "User rejected the request" | **`4100`** "Wallet is locked — the wallet withdrew this request (`idle:locked`)" |
| Beacon | `ABORTED_ERROR` | `ABORTED_ERROR` — **unchanged, and unavoidable** |

**The Beacon half cannot be fixed on the wire, and pretending otherwise would be worse.**
`ABORTED_ERROR` is the member the SDK documents as "aborted by the user OR THE WALLET", and the only
one it lists for Permission | Operation Request | Sign | Broadcast. The near-miss,
`NO_PRIVATE_KEY_FOUND_ERROR`, is documented "Returned by: Sign" only and would tell a dApp its
account was wrong — a worse lie than a coarse truth. So the distinction lives where this wallet
controls it: the envelope carries 4100 and names the trigger, and the content script logs
`refused (4100): Wallet is locked — … (idle:locked)` verbatim. That log is the artefact that turns
"the operator declined" into "the wallet auto-locked".

**Two tests asserted the defect as the contract** — `approval-queue.test.ts`'s `rejectAll` case
expected `'reject'`, and `sw-wiring-beacon.test.ts`'s lock-mid-prompt case expected `4001`. Both were
green. They are now inverted, with the history in the comment, and each is paired with a test that a
genuine operator rejection still reports `4001`: one code moving without the other is the regression
to catch. +4 tests, 754 total.
