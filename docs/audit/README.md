# Audit — 2026-06-01

Code-read audit of the wallet + relayer (HEAD `e537352`, wallet 0.9.0 / relayer 0.5.1),
plus an enablement plan for a future mobile app. Findings are tagged **CONFIRMED**
(read in code / executed) vs **INFERRED** (reasoned, not executed). Severities in the
documents are an *audit, production-deployment lens* — prioritization is the team's call.

Most findings are also filed as individual GitHub issues (#8–#48) for tracking.

## Documents

| File | Scope |
|------|-------|
| [AUDIT-2026-06-01.md](AUDIT-2026-06-01.md) | Functional audit: EVM-ecosystem correctness, security (POC lens), mobile extensibility, feature inventory (incl. Tezos X / NAC specifics) |
| [TEST-AUDIT-2026-06-01.md](TEST-AUDIT-2026-06-01.md) | Test base: quality, coverage gaps, CI/infra. Includes the empirical run (1 failing/timeout test; CI does not run tests) |
| [SECURITY-AUDIT-PROD-2026-06-01.md](SECURITY-AUDIT-PROD-2026-06-01.md) | Security under a production-mainnet lens, with a key-management state-of-the-art scorecard, signing/value-transfer findings, and extension attack surface |
| [MOBILE-APP-PLAN-2026-06-01.md](MOBILE-APP-PLAN-2026-06-01.md) | What it would take to ship a native mobile app alongside the extension: shared-core monorepo refactor + mobile platform integration, phased & sequenced |

## Method

Read-only, code-read audit across parallel reviewers; the test base was additionally
run empirically (`npm ci` + `npm test -w @tezosx/wallet`, Node v22). No live mainnet
testing. Calibration note carried throughout: code-sharing/throughput compresses, but
security audit, integration, secure-storage hardening, and real-device QA do not.
