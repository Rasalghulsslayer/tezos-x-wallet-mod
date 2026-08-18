/**
 * fetchWithDeadline: fetch with an AbortController-backed deadline. React
 * Native's stock fetch has no app-level timeout — a connected-but-dead
 * network (captive portal, DNS blackhole) spins ~60s on iOS and unboundedly
 * on Android — and MV3 offers none either. Read paths (balances, activity)
 * must fail fast into the degraded UI instead.
 *
 * Deliberately NOT used on signing/injection paths: aborting an operation
 * after broadcast is worse than waiting.
 *
 * The timeout error message contains "timed out" so formatError classifies
 * it as rpc-timeout.
 */

export async function fetchWithDeadline(
  url:       string,
  init:      RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
