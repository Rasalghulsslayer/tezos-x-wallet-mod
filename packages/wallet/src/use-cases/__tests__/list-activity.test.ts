import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listActivity } from '../list-activity';
import type {
  ActivityItem,
  ActivityTransferItem,
} from '../../domain/activity';
import type {
  ActivityFetcher,
  ActivityFetcherPage,
} from '../../ports/activity-fetcher';
import type { Container } from '../../composition/container';

// Mock the relayer's l1OpHashToEvmHash so the dedup is deterministic.
vi.mock('@tezosx/relayer/tezos', () => ({
  l1OpHashToEvmHash: (l1: string) => `0xsynth${l1}`,
}));
vi.mock('@tezosx/relayer/utils/derive', () => ({
  deriveEvmAlias: async () => '0xaliasforTZ1HOLDER',
}));

const TZ1 = 'tz1Holder';
const EVM = '0xaliasforTZ1HOLDER';

function tzTransfer(over: Partial<ActivityTransferItem> = {}): ActivityTransferItem {
  return {
    id:           'l1:1000',
    kind:         'transfer',
    direction:    'sent',
    runtime:      'l1',
    counterparty: 'tz1Other',
    asset:        'XTZ',
    amount:       '1000000',
    timestamp:    1_700_000_000_000,
    status:       'confirmed',
    links:        { primary: { explorer: 'tzkt', url: 'https://tzkt/op1' } },
    ...over,
  };
}

function tzCrossRuntime(opHash: string, ts = 1_700_000_000_000): ActivityTransferItem {
  return {
    id:           `l1:cr:${opHash}`,
    kind:         'transfer',
    direction:    'sent',
    runtime:      'l1',
    counterparty: '0xRecipient',
    asset:        'XTZ',
    amount:       '1000000',
    timestamp:    ts,
    status:       'confirmed',
    links:        { primary: { explorer: 'tzkt', url: `https://tzkt/${opHash}` } },
    crossRuntime: { direction: 'tezos-to-evm', l1OpHash: opHash, evmEffectStatus: 'unresolved', tzktOperationId: 42 },
  };
}

function evmTransfer(over: Partial<ActivityTransferItem> = {}): ActivityTransferItem {
  return {
    id:           'l2:0xevmhash',
    kind:         'transfer',
    direction:    'received',
    runtime:      'l2',
    counterparty: '0xPeer',
    asset:        'XTZ',
    amount:       '2000000000000000000',
    timestamp:    1_700_000_000_500,
    status:       'confirmed',
    links:        { primary: { explorer: 'blockscout', url: 'https://blockscout/tx/0xevmhash' } },
    ...over,
  };
}

function mockFetcher(items: ActivityItem[], cursor?: string): ActivityFetcher {
  return {
    list: vi.fn(async (): Promise<ActivityFetcherPage> => ({ items, cursor })),
  };
}

function failingFetcher(message: string): ActivityFetcher {
  return { list: vi.fn(async () => { throw new Error(message); }) };
}

function tezosContainer(tezos: ActivityFetcher, evm: ActivityFetcher, pendingOps: () => readonly { l1OpHash: string; evmAlias: string; to: string; fromBlock: string; broadcastedAt: number }[] = () => []): Container {
  return {
    signer:          { kind: 'tezos', account: { kind: 'tezos', id: TZ1, tz1: TZ1, publicKey: 'edpk…' } } as unknown as Container['signer'],
    provider:        {} as Container['provider'],
    balanceFetcher:  {} as Container['balanceFetcher'],
    activitySources: { tezos, evm, pendingOps },
    vaultStore:      {} as Container['vaultStore'],
    sessionStore:    {} as Container['sessionStore'],
    tokenStore:      {} as Container['tokenStore'],
    notifications:   {} as Container['notifications'],
  };
}

function evmAccountContainer(evm: ActivityFetcher): Container {
  return {
    signer:          { kind: 'evm', account: { kind: 'evm', id: '0xUser', address: '0xUser', publicKey: '0x…' } } as unknown as Container['signer'],
    provider:        {} as Container['provider'],
    balanceFetcher:  {} as Container['balanceFetcher'],
    activitySources: { evm },
    vaultStore:      {} as Container['vaultStore'],
    sessionStore:    {} as Container['sessionStore'],
    tokenStore:      {} as Container['tokenStore'],
    notifications:   {} as Container['notifications'],
  };
}

describe('listActivity', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('1. both sources empty', async () => {
    const out = await listActivity({}, { container: tezosContainer(mockFetcher([]), mockFetcher([])) });
    expect(out.items).toEqual([]);
    expect(out.staleness).toBe('fresh');
    expect(out.cursor).toBeUndefined();
  });

  it('2. merges two non-overlapping sources sorted by timestamp desc', async () => {
    const t1 = tzTransfer({ id: 'l1:1', timestamp: 1000 });
    const t2 = tzTransfer({ id: 'l1:2', timestamp: 3000 });
    const e1 = evmTransfer({ id: 'l2:e1', timestamp: 2000 });
    const e2 = evmTransfer({ id: 'l2:e2', timestamp: 4000 });
    const out = await listActivity({}, { container: tezosContainer(mockFetcher([t1, t2]), mockFetcher([e1, e2])) });
    expect(out.items.map((i) => i.id)).toEqual(['l2:e2', 'l1:2', 'l2:e1', 'l1:1']);
    expect(out.staleness).toBe('fresh');
  });

  it('3. dedupes a tz1→0x op + its kernel-synthesized EVM mirror', async () => {
    const tz   = tzCrossRuntime('opABC', 2000);
    const synth = '0xsynthopABC';
    const evmMatch = evmTransfer({ id: `l2:${synth}`, timestamp: 2500 });
    const out = await listActivity({}, { container: tezosContainer(mockFetcher([tz]), mockFetcher([evmMatch])) });
    expect(out.items).toHaveLength(1);
    const merged = out.items[0];
    expect(merged.id).toBe('x:opABC');
    expect(merged.kind).toBe('transfer');
    if (merged.kind !== 'transfer') return;
    expect(merged.runtime).toBe('cross-runtime');
    // The dedup correlates by lowercase synth hash (case-insensitive on EVM side).
    expect(merged.crossRuntime?.l2TxHash).toBe(synth.toLowerCase());
    expect(merged.crossRuntime?.evmEffectStatus).toBe('confirmed');
    expect(merged.links.primary.explorer).toBe('tzkt');
    expect(merged.links.secondary?.explorer).toBe('blockscout');
    expect(merged.timestamp).toBe(2500);
  });

  it('4. tz1→0x without mirror is rendered as cross-runtime/unresolved', async () => {
    const tz = tzCrossRuntime('opXYZ', 1000);
    const out = await listActivity({}, { container: tezosContainer(mockFetcher([tz]), mockFetcher([])) });
    expect(out.items).toHaveLength(1);
    const it0 = out.items[0];
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.runtime).toBe('cross-runtime');
    expect(it0.crossRuntime?.evmEffectStatus).toBe('unresolved');
  });

  it('5. TzKT failure surfaces as partial staleness with EVM items intact', async () => {
    const e1 = evmTransfer({ id: 'l2:e1', timestamp: 1000 });
    const out = await listActivity({}, {
      container: tezosContainer(failingFetcher('TzKT HTTP 503'), mockFetcher([e1])),
    });
    expect(out.items.map((i) => i.id)).toEqual(['l2:e1']);
    expect(out.staleness).toBe('partial');
    expect(out.errors?.[0].source).toBe('tezos');
    expect(out.errors?.[0].message).toBe('TzKT HTTP 503');
  });

  it('6. both sources failed → cached-only with empty items', async () => {
    const out = await listActivity({}, {
      container: tezosContainer(failingFetcher('tz fail'), failingFetcher('evm fail')),
    });
    expect(out.items).toEqual([]);
    expect(out.staleness).toBe('cached-only');
    expect(out.errors).toHaveLength(2);
  });

  it('7. pendingOps row whose l1OpHash already appears in tzItems is dropped', async () => {
    const tz = tzCrossRuntime('opPENDING', 5000);
    const pending = [
      { l1OpHash: 'opPENDING', evmAlias: EVM, to: '0xRecipient', fromBlock: '0x1', broadcastedAt: 6000 },
    ];
    const out = await listActivity({}, {
      container: tezosContainer(mockFetcher([tz]), mockFetcher([]), () => pending),
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('x:opPENDING');
  });

  it('8. pendingOps row absent from tzItems is surfaced at the top', async () => {
    const pending = [
      { l1OpHash: 'opFRESH', evmAlias: EVM, to: '0xRecipient', fromBlock: '0x1', broadcastedAt: 9_999_999_999_999 },
    ];
    const out = await listActivity({}, {
      container: tezosContainer(mockFetcher([]), mockFetcher([]), () => pending),
    });
    expect(out.items).toHaveLength(1);
    const it0 = out.items[0];
    expect(it0.id).toBe('x:opFRESH');
    expect(it0.kind).toBe('transfer');
    if (it0.kind !== 'transfer') return;
    expect(it0.status).toBe('pending');
    expect(it0.crossRuntime?.evmEffectStatus).toBe('pending');
  });

  it('9. AliasForwarder self-transfer is dropped by default', async () => {
    const self = tzCrossRuntime('opSELF', 1000);
    self.counterparty = EVM;  // sending to my own alias
    const out = await listActivity({}, { container: tezosContainer(mockFetcher([self]), mockFetcher([])) });
    expect(out.items).toHaveLength(0);
  });

  it('9b. AliasForwarder self-transfer surfaces when includeAliasSelfTransfers is true', async () => {
    const self = tzCrossRuntime('opSELF', 1000);
    self.counterparty = EVM;
    const out = await listActivity(
      { filter: { includeAliasSelfTransfers: true } },
      { container: tezosContainer(mockFetcher([self]), mockFetcher([])) },
    );
    expect(out.items).toHaveLength(1);
  });

  it('10. limit:3 with 5 items truncates and emits a cursor', async () => {
    const items = [1, 2, 3, 4, 5].map((n) => tzTransfer({ id: `l1:${n}`, timestamp: n * 1000 }));
    const out = await listActivity({ limit: 3 }, {
      container: tezosContainer(mockFetcher(items, '999'), mockFetcher([])),
    });
    expect(out.items).toHaveLength(3);
    expect(out.cursor).toBeDefined();
  });

  it('11. evm-to-tezos precompile call from EVM side is preserved (no double-count)', async () => {
    // Pending W7b-1 empirical observation: if TzKT does NOT surface kernel
    // mirror ops on the destination tz1, the use case is a no-op for this
    // direction — the Blockscout-source precompile call passes through as-is.
    // If TzKT later starts surfacing mirrors, this test should grow a second
    // case with the mirror present and asserts it's dropped.
    const evmPrecompile: ActivityTransferItem = {
      id:           'l2:0xprecall',
      kind:         'transfer',
      direction:    'sent',
      runtime:      'cross-runtime',
      counterparty: 'tz1Dest',
      asset:        'XTZ',
      amount:       '1000000000000000000',
      timestamp:    3000,
      status:       'confirmed',
      links:        { primary: { explorer: 'blockscout', url: 'https://blockscout/tx/0xprecall' } },
      crossRuntime: { direction: 'evm-to-tezos', l1OpHash: '', l2TxHash: '0xprecall', evmEffectStatus: 'confirmed' },
    };
    const out = await listActivity({}, {
      container: tezosContainer(mockFetcher([]), mockFetcher([evmPrecompile])),
    });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].id).toBe('l2:0xprecall');
  });

  it('EVM-only container (no TzKT) returns EVM rows for an EVM-native account', async () => {
    const e1 = evmTransfer({ id: 'l2:e1', timestamp: 1000 });
    const out = await listActivity({}, { container: evmAccountContainer(mockFetcher([e1])) });
    expect(out.items.map((i) => i.id)).toEqual(['l2:e1']);
    expect(out.staleness).toBe('fresh');
  });
});
