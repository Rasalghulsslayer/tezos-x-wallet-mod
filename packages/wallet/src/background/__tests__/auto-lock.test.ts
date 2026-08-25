/**
 * auto-lock — the wallet-inactivity deadline that covers the window MV3
 * service-worker death does not: the worker kept alive (open side panel,
 * dApp traffic) while the user has stepped away from the wallet. chrome.idle
 * never fires in that scenario when the user is active elsewhere in the
 * browser, so the deadline is what actually locks. These tests pin the pure
 * predicate and the port-driven orchestration with fakes; the chrome wiring
 * (alarms / idle / suspend) stays a thin shell in service-worker.ts.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_LOCK_IDLE_MS,
  AUTO_LOCK_PENDING_GRACE_MS,
  autoLockBudgetMs,
  checkIdleDeadline,
  recordActivity,
  shouldAutoLock,
  type AutoLockPorts,
} from '../auto-lock';

const T0 = 1_700_000_000_000;

function fakePorts(overrides: Partial<AutoLockPorts> = {}) {
  const locks: string[] = [];
  let stamp: number | undefined;
  const ports: AutoLockPorts = {
    isUnlocked: () => true,
    lock: (reason) => { locks.push(reason); },
    now: () => T0,
    loadLastActivity: async () => stamp,
    saveLastActivity: async (ms) => { stamp = ms; },
    hasPendingApproval: () => false,
    ...overrides,
  };
  return {
    ports,
    locks,
    get stamp() { return stamp; },
    set stamp(v: number | undefined) { stamp = v; },
  };
}

describe('shouldAutoLock — pure deadline predicate', () => {
  it('does not lock before the deadline', () => {
    expect(shouldAutoLock(T0 - AUTO_LOCK_IDLE_MS + 1, T0)).toBe(false);
  });

  it('locks exactly at and past the deadline', () => {
    expect(shouldAutoLock(T0 - AUTO_LOCK_IDLE_MS, T0)).toBe(true);
    expect(shouldAutoLock(T0 - AUTO_LOCK_IDLE_MS - 60_000, T0)).toBe(true);
  });

  it('fails closed when no activity stamp exists', () => {
    expect(shouldAutoLock(undefined, T0)).toBe(true);
  });

  it('honours a custom idle window', () => {
    expect(shouldAutoLock(T0 - 10_000, T0, 30_000)).toBe(false);
    expect(shouldAutoLock(T0 - 30_000, T0, 30_000)).toBe(true);
  });
});

describe('recordActivity', () => {
  it('stamps the current time while unlocked', async () => {
    const f = fakePorts();
    await recordActivity(f.ports);
    expect(f.stamp).toBe(T0);
  });

  it('does not stamp while locked — a stale stamp must not outlive its session', async () => {
    const f = fakePorts({ isUnlocked: () => false });
    await recordActivity(f.ports);
    expect(f.stamp).toBeUndefined();
  });
});

describe('checkIdleDeadline', () => {
  it('locks once the deadline has passed', async () => {
    const f = fakePorts();
    f.stamp = T0 - AUTO_LOCK_IDLE_MS;
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual(['idle-deadline']);
  });

  it('does not lock while activity is fresh', async () => {
    const f = fakePorts();
    f.stamp = T0 - 1_000;
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual([]);
  });

  it('fails closed on an unlocked wallet with no stamp', async () => {
    const f = fakePorts();
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual(['idle-deadline']);
  });

  it('is a no-op while locked (an alarm reviving a dead worker must not throw)', async () => {
    const load = vi.fn(async () => undefined);
    const f = fakePorts({ isUnlocked: () => false, loadLastActivity: load });
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});

describe('the pending-approval grace', () => {
  // ⚠️ WHAT THIS BUYS AND WHAT IT COSTS. Locking calls `rejectAll()`, so an
  // auto-lock does not pause an approval, it destroys it. `chrome.idle` measures
  // keyboard and mouse across the whole machine, which means an operator reading
  // a 38 kB undecoded Micheline parameter — precisely what the approval screen
  // asks of them — registers as idle. A 25-operation ceremony was therefore one
  // careful read away from being ended by the wallet. The grace is the fix; the
  // ceiling below is the price, stated as a test rather than as a comment.

  it('extends the budget once when a prompt is on screen', () => {
    expect(autoLockBudgetMs(false)).toBe(AUTO_LOCK_IDLE_MS);
    expect(autoLockBudgetMs(true)).toBe(AUTO_LOCK_IDLE_MS + AUTO_LOCK_PENDING_GRACE_MS);
  });

  it('keeps an unlocked wallet through the read that used to kill the ceremony', async () => {
    const f = fakePorts({ hasPendingApproval: () => true });
    // Eight minutes on one operation: past the 5-minute deadline, inside the grace.
    f.stamp = T0 - 8 * 60_000;
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual([]);
  });

  it('still locks the same wallet at the same instant with NO prompt open', async () => {
    // The control: the grace must come from the prompt, not from the clock moving.
    const f = fakePorts({ hasPendingApproval: () => false });
    f.stamp = T0 - 8 * 60_000;
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual(['idle-deadline']);
  });

  it('LOCKS ANYWAY once the grace is exhausted, and says which budget expired', async () => {
    // The bound is the security argument. A prompt that is never answered must
    // not hold the keyring open indefinitely.
    const f = fakePorts({ hasPendingApproval: () => true });
    f.stamp = T0 - (AUTO_LOCK_IDLE_MS + AUTO_LOCK_PENDING_GRACE_MS);
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual(['idle-deadline (approval grace exhausted)']);
  });

  it('is a CEILING from the last interaction, not a window a page can renew', () => {
    // The grace is derived from the same `lastActivity` stamp rather than from
    // when the prompt opened, so a page cannot suspend the deadline by holding a
    // prompt open — it can only push it out once, to 15 minutes total. This is
    // also why a restarted service worker recomputes the identical deadline
    // without persisting anything new.
    const ceiling = AUTO_LOCK_IDLE_MS + AUTO_LOCK_PENDING_GRACE_MS;
    expect(shouldAutoLock(T0 - ceiling, T0, autoLockBudgetMs(true))).toBe(true);
    expect(shouldAutoLock(T0 - ceiling + 1, T0, autoLockBudgetMs(true))).toBe(false);
    // And the ceiling is finite — the property a `return` in the listener would break.
    expect(Number.isFinite(ceiling)).toBe(true);
    expect(ceiling).toBe(15 * 60_000);
  });

  it('still fails closed with a prompt open and no stamp at all', async () => {
    // An unknown-provenance session is not rescued by having a prompt on screen.
    const f = fakePorts({ hasPendingApproval: () => true });
    await checkIdleDeadline(f.ports);
    expect(f.locks).toEqual(['idle-deadline (approval grace exhausted)']);
  });
});
