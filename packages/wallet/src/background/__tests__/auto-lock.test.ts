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
