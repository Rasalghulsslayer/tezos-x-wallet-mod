# `@tezosx/wallet` — Playwright E2E tests

Playwright harness that loads the built MV3 extension into a real Chromium and exercises the dApp flows, the approval popup, the security guards, and the send/status paths. **All network calls are mocked** (Tezlink, Michelson, TzKT, Blockscout). Tests are deterministic and reproducible offline.

## Running the suite

Prerequisite: `npm run build -w @tezosx/wallet` must have produced `packages/wallet/dist/`.

```bash
# from packages/wallet/
npm run test:e2e              # REPLAY mode (default) — uses committed fixtures
npm run test:e2e:record       # RECORD mode — captures real previewnet responses (commit-only)
npm run test:e2e:ui           # interactive Playwright UI mode for debugging
```

In CI: `e2e-wallet` is a blocking gate — `needs: [build-wallet]`, downloads the `wallet-dist` artifact, runs `npm run test:e2e`. See `.github/workflows/ci.yml`.

## Harness layout

- `playwright.config.ts` — Playwright config (`channel: 'chromium'`, workers, retain-on-failure).
- `global-setup.ts` — preflight assertions (`dist/` exists, manifest sanity, etc.).
- `harness/` — harness code (extension loading, vault pre-injection, unlock, mock router, page objects).
- `fixtures/` — test data (encrypted vault + per-host network recordings).
- `specs/` — Playwright specs grouped by flow (smoke, send same-runtime, send cross-runtime, dApp approvals).
- `scripts/` — one-shot tooling (`spike.ts`, `gen-vault.ts`).

See the implementation plan in `.claude/plans/` for the full design rationale.

## Conventions

- No `page.waitForTimeout` in specs — wait for DOM events or for `respondSequence` sequences in the mock router.
- RECORD mode writes append-only and refuses non-2xx responses implicitly. A flaky test does not silently overwrite the previous fixture.
- REPLAY mode is fail-loud on cache miss (`route.abort('failed')` + clear log) — no silent empty response.
- Selectors: `getByRole` first, then a `data-testid` added to the target component, then `text=` for stable product strings.

## Feasibility findings

Status: ✓ **All green. Strategy validated, harness construction unblocked.**

Run on 2026-06-05 on macOS (darwin) with Node v23.9.0 against the current `dist/` (wallet 0.11.3). Script: `e2e/scripts/spike.ts`. See the source to reproduce.

### `context.route('**')` × service worker MV3 fetch (the founding bet)

**Result: PASS.** The `context.route('**')` handler was invoked exactly once for the fetch issued by `sw.evaluate(() => fetch('https://api.previewnet.tezosx.tzkt.io/v1/head'))`, AND the SW actually received the mocked body (`{ level: 999999, hash: 'spike-mock' }`).

**Consequence**: the main mocking strategy is viable. No need to fall back to adapter injection via the composition root.

### `channel: 'chromium'` loads the extension and exposes the SW

**Result: PASS.** `chromium.launchPersistentContext({ channel: 'chromium', args: ['--load-extension=…'] })` loads the extension and `context.serviceWorkers()[0]` returns the SW at `chrome-extension://<id>/service-worker-loader.js` immediately (no `waitForEvent` needed).

**Consequence**: CI can run with `npx playwright install --with-deps chromium` + `channel: 'chromium'` in headless mode. No `xvfb-run`, no extra system dependency.

### `keyring.ts` import under tsx Node

**Result: PASS.** `import('../../src/background/keyring.ts')` resolves under tsx (Node v23.9.0). Observed exports: `AccountNotFoundError`, `CannotRemoveLastAccountError`, `Keyring`, `MaxAccountsReachedError`. The transitive chain (Taquito `InMemorySigner`, `@scure/bip39`, etc.) does not block under Node.

**Nuance for the test-vault generator**: `encryptJson` / `decryptVaultRaw` are **not** free exports — encryption happens through the `Keyring` class. The generator script will therefore either instantiate a `Keyring` and call its public API (`createWallet` / `importWallet`) to produce an encrypted vault, or refactor to export the encryption primitive. Decision deferred to the generator implementation — the "shipping code = generation code" invariant holds either way.

### Locked-in decisions

- **Main path** validated: `context.route('**')` + `channel: 'chromium'` + `sw.evaluate()` for vault pre-injection and programmatic UNLOCK.
- **No adapter-injection fallback** needed.
- **No `xvfb-run`** in CI.
- **Test-vault generation**: `tsx` route retained (transitive import works), going through the `Keyring` public API.

### Re-running the check

If Playwright bumps a major version, if the wallet code changes the `keyring → seed → Taquito` import chain, or to validate a new Chromium version in CI:

```bash
cd packages/wallet
npm run build
npx tsx e2e/scripts/spike.ts
```

Exit code 0 = all green.
