/**
 * use-account-data — the module-level (pure) part of the balances read-through:
 * mapping a persisted snapshot to the view the screens render. The effect
 * orchestration itself needs a renderer; the honesty rule it applies is pinned
 * here — a snapshot that never held a native balance maps to null, so the UI
 * falls back to '—' instead of showing an empty-but-labeled value.
 */

import { describe, expect, it, vi } from 'vitest';

// The module pulls the live wiring (MMKV, Keychain, quick-crypto) at import
// time — stub it out; the helper under test never touches it.
vi.mock('../../composition/wiring', () => ({
  tokenStore: {},
  snapshotStore: {},
  deps: { state: { container: null } },
}));

import { balancesSnapshotToView } from '../use-account-data';

describe('balancesSnapshotToView', () => {
  it('maps a full snapshot to the view shape', () => {
    expect(balancesSnapshotToView({
      data:      { xtz: '12.5', erc20: { '0xtoken': '3.14' } },
      fetchedAt: 1_753_000_000_000,
    })).toEqual({ xtz: '12.5', tokens: { '0xtoken': '3.14' } });
  });

  it('a missing snapshot maps to null', () => {
    expect(balancesSnapshotToView(null)).toBeNull();
  });

  it('a snapshot that never held a native balance maps to null (nothing honest to show)', () => {
    expect(balancesSnapshotToView({
      data:      { xtz: null, erc20: {} },
      fetchedAt: 1_753_000_000_000,
    })).toBeNull();
  });
});
