/**
 * auto-lock: the extension analog of the mobile shell's lock/auto-lock.ts.
 *
 * The unlocked keyring lives only in service-worker memory, so MV3 killing the
 * worker is itself a lock. What needs covering is the window where the worker
 * stays alive — an open popup / side panel or steady dApp traffic keeps it
 * running — while the user has stepped away from the wallet:
 *
 *   - a wallet-inactivity deadline: trusted-UI messages stamp an activity
 *     timestamp, and a periodic alarm locks once the deadline passes. This is
 *     the extension's equivalent of the mobile touch()-reset idle timer, and
 *     it covers the case chrome.idle cannot — the user active elsewhere in the
 *     browser (system never idle) with the wallet unlocked in a side panel;
 *   - system idle / screen lock / worker suspend, wired directly in the
 *     service worker via chrome.idle and onSuspend (the analog of the mobile
 *     lock-on-backgrounding).
 *
 * No chrome.* here: the service worker injects AutoLockPorts, tests use fakes.
 * The activity stamp lives in chrome.storage.session so it survives a worker
 * restart mid-session and dies with the browser, matching the vault's own
 * unlocked lifetime.
 */

export const AUTO_LOCK_IDLE_MS = 5 * 60_000; // mirrors the mobile DEFAULT_IDLE_MS
export const AUTO_LOCK_ALARM_NAME = 'auto-lock-deadline';
/** chrome.alarms' floor for a packed extension is 1 minute — the enforcement
 *  granularity on top of AUTO_LOCK_IDLE_MS. */
export const AUTO_LOCK_ALARM_PERIOD_MINUTES = 1;

export interface AutoLockPorts {
  isUnlocked(): boolean;
  lock(reason: string): void;
  now(): number;
  loadLastActivity(): Promise<number | undefined>;
  saveLastActivity(ms: number): Promise<void>;
}

/**
 * Pure deadline predicate. An unlocked wallet with no stamp fails closed
 * (lock): the stamp is written on every trusted-UI message, so its absence
 * means the session's provenance is unknown.
 */
export function shouldAutoLock(
  lastActivity: number | undefined,
  now: number,
  idleMs: number = AUTO_LOCK_IDLE_MS,
): boolean {
  if (lastActivity == null) return true;
  return now - lastActivity >= idleMs;
}

/** Stamp wallet activity. Called after dispatch so an UNLOCK message stamps
 *  the freshly-unlocked session; a no-op while locked (nothing to protect,
 *  and a stale stamp must not outlive the session that wrote it). */
export async function recordActivity(ports: AutoLockPorts): Promise<void> {
  if (!ports.isUnlocked()) return;
  await ports.saveLastActivity(ports.now());
}

/** Alarm tick: lock when the inactivity deadline has passed. */
export async function checkIdleDeadline(
  ports: AutoLockPorts,
  idleMs: number = AUTO_LOCK_IDLE_MS,
): Promise<void> {
  if (!ports.isUnlocked()) return;
  if (shouldAutoLock(await ports.loadLastActivity(), ports.now(), idleMs)) {
    ports.lock('idle-deadline');
  }
}
