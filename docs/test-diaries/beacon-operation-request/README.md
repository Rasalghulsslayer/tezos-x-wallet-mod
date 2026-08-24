# Test diary — Beacon `operation_request`, milestone 2

**Branch:** `feat/beacon-wallet-provider` · **Date:** 2026-08-24 · **Scope:** milestone 2 only
**Gates:** tsc 0 across relayer + relayer/ext + core + wallet · eslint 0 errors (10 pre-existing warnings, unchanged) · vitest **643 passing across 63 files** (587 / 61 after milestone 1, **+56 / +2**) · `npm run build:wallet` ✓ · eager per-page cost 5.1 kB
**Live run:** **NOT DONE.** No operation has been signed or injected over Beacon. Milestone 1's connect is live-proven; nothing in this milestone is.
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

### 6.2 `packages/core/src/adapters/tezos/__tests__/tezos-signer.test.ts` — 14 tests

**The most important suite in this milestone.** Taquito is mocked, because the alternative is
injecting operations against previewnet from a unit test.

| # | Test | Pins |
|---|---|---|
| 1 | a pinned operation submits the pin **byte-for-byte** | The whole design. Asserts the exact `TransferParams`. |
| 2 | **runs NO estimate** | An estimate here replaces the dApp's measurement with the wallet's guess, and the two are not interchangeable on this chain. |
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
tsc --noEmit        relayer ✓  relayer/extension ✓  core ✓  wallet ✓        (0 errors)
eslint              0 errors, 10 warnings — all pre-existing, count unchanged
vitest              wallet 303 / 24 files · core 315 / 34 files · relayer 25 / 5 files
                    = 643 tests / 63 files passing   (was 587 / 61 — +56 / +2)
npm run build:wallet ✓  incl. the content-script Buffer gate
eager per-page cost 5.1 kB (unchanged) · lazy chunk 148 kB
```

## 8. NOT DONE — stated, not smoothed over

- **NO OPERATION HAS BEEN SIGNED OR INJECTED OVER BEACON.** Milestone 1's connect is live-proven;
  every claim in this milestone is from unit tests, the installed SDK, the dApp's source, and two
  live RPC reads. The pin-honouring behaviour is the part most worth a live run, because the failure
  it guards against — a fee under the floor — presents as a generic abort with no diagnosis.
- **The 23-op ceremony is untested end to end.** Each op kind is covered in isolation; the sequence,
  its inter-op state, and the recovery paths are not.
- **`AUTO-LOCK IS STILL A CEREMONY HAZARD` and is still not addressed.** `AUTO_LOCK_IDLE_MS` is 5
  minutes and only `trusted-ui` traffic defers it; `autoLock` calls `queue.rejectAll()`. Approving
  each op does defer the deadline, so the common path survives — but any step that keeps the operator
  away for >5 min kills the run, and `chrome.idle` locks immediately on screen lock. Named in
  milestone 1's diary, unchanged here, and it should be decided before a real ceremony.
- **A locked wallet still fails indistinguishably from a user rejection** (milestone 1 §4.1/L4), and
  a mid-ceremony auto-lock would present exactly that way.
- **`sign_payload` is not implemented** and the `sign` scope is still not granted.
- **Batches are refused, not supported.** If the ceremony ever batches, this needs revisiting.
- **The `CALL_EVM_GAS_LIMIT` defect is reported, not fixed** (§5).
- **No reviewer pass on this milestone yet.** Milestone 1's found a blocker in the build artefacts
  that every green test missed; this milestone has had no equivalent scrutiny.
