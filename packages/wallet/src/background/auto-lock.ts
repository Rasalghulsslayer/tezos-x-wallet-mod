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

import {
  AUTO_LOCK_IDLE_MS,
  AUTO_LOCK_PENDING_GRACE_MS,
} from '@tezosx/wallet-core/shared/constants';

export { AUTO_LOCK_IDLE_MS, AUTO_LOCK_PENDING_GRACE_MS };
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
  /**
   * Is a dApp approval on screen right now?
   *
   * Locking rejects every pending approval, so this is the difference between
   * "the operator walked away" and "the operator is reading the prompt". No
   * extra persisted state hangs off it: the grace it buys is derived from the
   * SAME `lastActivity` stamp, so a restarted worker recomputes the identical
   * deadline.
   */
  hasPendingApproval(): boolean;
}

/**
 * The inactivity budget in force right now.
 *
 * One expression, so the ceiling is impossible to state two different ways: a
 * pending prompt buys `graceMs` ONCE, measured from the same stamp, and cannot
 * renew it.
 */
export function autoLockBudgetMs(
  hasPendingApproval: boolean,
  idleMs:  number = AUTO_LOCK_IDLE_MS,
  graceMs: number = AUTO_LOCK_PENDING_GRACE_MS,
): number {
  return hasPendingApproval ? idleMs + graceMs : idleMs;
}

/**
 * Pure deadline predicate. An unlocked wallet with no stamp fails closed
 * (lock): the stamp is written on every trusted-UI message, so its absence
 * means the session's provenance is unknown.
 */
export function shouldAutoLock(
  lastActivity: number | undefined,
  now: number,
  budgetMs: number = AUTO_LOCK_IDLE_MS,
): boolean {
  if (lastActivity == null) return true;
  return now - lastActivity >= budgetMs;
}

/** Stamp wallet activity. Called after dispatch so an UNLOCK message stamps
 *  the freshly-unlocked session; a no-op while locked (nothing to protect,
 *  and a stale stamp must not outlive the session that wrote it). */
export async function recordActivity(ports: AutoLockPorts): Promise<void> {
  if (!ports.isUnlocked()) return;
  await ports.saveLastActivity(ports.now());
}

/**
 * Alarm tick: lock when the inactivity deadline has passed.
 *
 * An open approval prompt widens the deadline by `graceMs` — see
 * `AUTO_LOCK_PENDING_GRACE_MS` for why, and for what it costs. The reason names
 * which budget expired, because "auto-locked" alone does not tell an operator
 * whether they had 5 minutes or 15.
 */
export async function checkIdleDeadline(
  ports:   AutoLockPorts,
  idleMs:  number = AUTO_LOCK_IDLE_MS,
  graceMs: number = AUTO_LOCK_PENDING_GRACE_MS,
): Promise<void> {
  if (!ports.isUnlocked()) return;
  const pending = ports.hasPendingApproval();
  const budget  = autoLockBudgetMs(pending, idleMs, graceMs);
  if (shouldAutoLock(await ports.loadLastActivity(), ports.now(), budget)) {
    ports.lock(pending ? 'idle-deadline (approval grace exhausted)' : 'idle-deadline');
  }
}
