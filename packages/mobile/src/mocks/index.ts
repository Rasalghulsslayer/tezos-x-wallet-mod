/**
 * Mock domain data — the design's fixtures (mirrors mobile/lib.jsx). Shaped the
 * way the real view-models will feed the screens, so swapping in the live
 * composition later (keyring / WalletConnect / balance fetchers) is a data-only
 * change behind the WalletContext. Nothing here is wired to the network.
 */

export type Runtime = 'l1' | 'l2' | 'cross';
export type TxStatus = 'confirmed' | 'pending' | 'failed';

export interface MockTezosAccount {
  id: string; kind: 'tezos'; label: string; createdAt: number;
  tz1: string; evmAlias: string; seed?: string;
}
export interface MockEvmAccount {
  id: string; kind: 'evm'; label: string; createdAt: number; address: string;
}
export type MockAccount = MockTezosAccount | MockEvmAccount;

export interface MockToken {
  address: string; symbol: string; name: string; decimals: number;
  builtin?: boolean; runtime: 'evm';
}
export interface MockBalance { xtz: string; tokens: Record<string, string>; }
export interface MockActivityItem {
  id: string; dir: 'out' | 'in'; verb: string; peer: string;
  runtime: Runtime; amount: string; symbol: string; status: TxStatus; ts: number;
}
export interface MockSession { origin: string; accountId: string; connectedAt: number; }

export type PendingKind = 'connect' | 'transaction' | 'signature';

export const USDC: MockToken = {
  address: '0x9aB4c2D6e8F1035792bA4c6D8e0F13579aBc2468',
  symbol: 'USDC', name: 'USD Coin', decimals: 6, builtin: true, runtime: 'evm',
};

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    id: 'acc-1', kind: 'tezos', label: 'Main account', createdAt: 1714000000000,
    tz1: 'tz1Sv7ZRkWsnVT2mkjhwpkLTq9scmZdu8Ri',
    evmAlias: '0xB4C8d6A3F1c29c8a4D0e7b21569a3cE16F2011E',
    seed: 'harbor slope violet ranch puzzle cabin oxygen mimic drama fossil quantum ladder',
  },
  {
    id: 'acc-2', kind: 'tezos', label: 'Savings', createdAt: 1715200000000,
    tz1: 'tz1Xf9pQ2rN8vKdLmY3tWbEjHsA6cZ4uPnGq',
    evmAlias: '0x7A2f91Cd4E8bB3a05F16dC9e2a1B8740eDc3F9a2',
    seed: 'ranch puzzle cabin oxygen mimic drama fossil quantum ladder harbor slope violet',
  },
  {
    id: 'acc-3', kind: 'evm', label: 'EVM trading', createdAt: 1716400000000,
    address: '0xa1C2b3D4e5F60718293A4b5C6d7E8f9012345678',
  },
];

export const MOCK_BALANCES: Record<string, MockBalance> = {
  'acc-1': { xtz: '1284.5391', tokens: { [USDC.address.toLowerCase()]: '520.00' } },
  'acc-2': { xtz: '46.20', tokens: {} },
  'acc-3': { xtz: '3.9942', tokens: { [USDC.address.toLowerCase()]: '1250.75' } },
};

export const MOCK_TOKENS: Record<string, MockToken[]> = { 'acc-1': [USDC], 'acc-2': [], 'acc-3': [USDC] };

const now = 1782837600000; // fixed clock so the fixtures are deterministic (no Date.now at module load)
const H = 3600000, D = 86400000;

export const MOCK_ACTIVITY: Record<string, MockActivityItem[]> = {
  'acc-1': [
    { id: 'a1', dir: 'out', verb: 'Sent',     peer: 'tz1burnZ8Qm4kP2wX', runtime: 'l1',    amount: '25.00',  symbol: 'XTZ',  status: 'confirmed', ts: now - 2 * H },
    { id: 'a2', dir: 'in',  verb: 'Received', peer: 'tz1faucetKpL9nQ',   runtime: 'l1',    amount: '500.00', symbol: 'XTZ',  status: 'confirmed', ts: now - 5 * H },
    { id: 'a3', dir: 'out', verb: 'Sent',     peer: '0xB4C8d6A3F1c2',    runtime: 'cross', amount: '120.00', symbol: 'XTZ',  status: 'confirmed', ts: now - 9 * H },
    { id: 'a4', dir: 'out', verb: 'Sent',     peer: '0x7A2f91Cd4E8b',    runtime: 'l2',    amount: '80.00',  symbol: 'USDC', status: 'pending',   ts: now - D - H },
    { id: 'a5', dir: 'in',  verb: 'Received', peer: 'tz1Xf9pQ2rN8v',     runtime: 'l1',    amount: '12.50',  symbol: 'XTZ',  status: 'confirmed', ts: now - D - 4 * H },
    { id: 'a6', dir: 'out', verb: 'Sent',     peer: '0xa1C2b3D4e5F6',    runtime: 'cross', amount: '5.00',   symbol: 'XTZ',  status: 'failed',    ts: now - 3 * D },
    { id: 'a7', dir: 'in',  verb: 'Received', peer: '0x9aB4c2D6e8F1',    runtime: 'l2',    amount: '300.00', symbol: 'USDC', status: 'confirmed', ts: now - 4 * D },
  ],
  'acc-2': [
    { id: 'b1', dir: 'in', verb: 'Received', peer: 'tz1Sv7ZRkWsnVT2', runtime: 'l1', amount: '46.20', symbol: 'XTZ', status: 'confirmed', ts: now - 6 * H },
  ],
  'acc-3': [
    { id: 'c1', dir: 'out', verb: 'Sent',     peer: '0x51F3aa9e12bC', runtime: 'l2', amount: '250.00',  symbol: 'USDC', status: 'confirmed', ts: now - 3 * H },
    { id: 'c2', dir: 'in',  verb: 'Received', peer: '0x9aB4c2D6e8F1', runtime: 'l2', amount: '1250.75', symbol: 'USDC', status: 'confirmed', ts: now - 2 * D },
  ],
};

export const MOCK_SESSIONS: MockSession[] = [
  { origin: 'https://app.iguana.fi',   accountId: 'acc-1', connectedAt: now - 2 * D },
  { origin: 'https://swap.tezos-x.io', accountId: 'acc-3', connectedAt: now - 8 * H },
];

export interface PendingConnect { kind: 'connect'; origin: string; accountId: string; }
export interface PendingTransaction {
  kind: 'transaction'; origin: string; accountId: string;
  methodSig: string; to: string; value: string; data: string;
  crossRuntime?: { michelsonTarget: string; entrypoint: string; decodedSelector: string; mutezValue: string };
}
export interface PendingSignature { kind: 'signature'; origin: string; accountId: string; message: string; decoded: string; }
export type PendingRequest = PendingConnect | PendingTransaction | PendingSignature;

export const MOCK_PENDING: Record<PendingKind, PendingRequest> = {
  connect: { kind: 'connect', origin: 'https://app.iguana.fi', accountId: 'acc-1' },
  transaction: {
    kind: 'transaction', origin: 'https://swap.tezos-x.io', accountId: 'acc-1',
    methodSig: 'swapExactTokensForTokens', to: '0x51F3aa9e12bC7d4E90aF3b28c6D1e5A70bF94c22',
    value: '0 XTZ', data: '0x38ed1739000000000000000000000000000000000000000000000000',
    crossRuntime: {
      michelsonTarget: 'KT18oDJJKXMKhfE1bSuAPGp92pYcwVDiqsPw', entrypoint: 'call_evm',
      decodedSelector: '0x38ed1739', mutezValue: '0',
    },
  },
  signature: {
    kind: 'signature', origin: 'https://app.iguana.fi', accountId: 'acc-1',
    message: '0x53656c6c206f7264657220233432',
    decoded: 'Iguana Finance\n\nSign in to confirm you own this address.\n\nNonce: 4f8a20e1\nIssued: 2026-07-01T09:41:00Z',
  },
};
