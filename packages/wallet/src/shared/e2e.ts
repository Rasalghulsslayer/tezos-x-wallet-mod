/**
 * Test-only seam. End-to-end specs run the built extension, so they can't reach
 * in and shorten the long status timeouts that gate the cross-runtime
 * "couldn't confirm" path. A spec sets `globalThis.__e2e__` (via an init script)
 * to collapse those windows from minutes to seconds.
 *
 * In production builds `__e2e__` is never set, so every reader falls back to its
 * shipped constant and behaviour is unchanged. This is the single sanctioned
 * `globalThis` escape hatch in the wallet; keep all of it behind this accessor.
 */
export interface E2eConfig {
  /** Override for Send's synthetic→real hash resolution window, in ms. */
  resolveTimeoutMs?: number;
  /** Override for the tx-status poller's hard timeout, in ms. */
  txPollTimeoutMs?: number;
}

export function e2eConfig(): E2eConfig | undefined {
  return (globalThis as { __e2e__?: E2eConfig }).__e2e__;
}
