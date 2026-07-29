import { describe, expect, it } from 'vitest';
import { activityRowVM } from '../activity-vm';
import type {
  ActivityContractCallItem,
  ActivityTransferItem,
  ActivityUnknownItem,
  ActivitySignatureItem,
} from '@tezosx/wallet-core/domain/activity';

import { XTZ_L1_ASSET, XTZ_L2_ASSET, type Erc20Asset } from '@tezosx/wallet-core/domain/asset';

const baseLinks = { primary: { explorer: 'tzkt' as const, url: 'https://tzkt/op' } };

const USDC_ASSET: Erc20Asset = {
  kind: 'erc20', address: '0xd77420f73b4612a7a99dba8c2afd30a1886b0344',
  symbol: 'USDC', name: 'USD Coin', decimals: 6, runtime: 'evm',
};

describe('activityRowVM', () => {
  it('projects a sent L1 transfer', () => {
    const ts = Date.now() - 60_000;
    const item: ActivityTransferItem = {
      id: 'l1:1', kind: 'transfer', direction: 'sent', runtime: 'l1',
      counterparty: 'tz1SampleAddressOf36CharsLong00000000', asset: XTZ_L1_ASSET, amount: '1000000',
      timestamp: ts, status: 'confirmed', links: baseLinks,
    };
    const vm = activityRowVM(item, ts + 60_000);
    expect(vm.verb).toBe('Sent');
    expect(vm.arrow).toBe('→');
    expect(vm.amount).toEqual({ value: '1', sign: '−' });
    expect(vm.asset).toBe('XTZ');
    expect(vm.runtimeBadge).toBe('l1');
    expect(vm.runtimeTag).toBe('Michelson');
    expect(vm.status).toBe('confirmed');
    expect(vm.primaryUrl).toBe('https://tzkt/op');
    expect(vm.secondaryUrl).toBeUndefined();
    expect(vm.ago).toBe('1m ago');
    expect(vm.dayGroup).toBe('Today');
  });

  it('projects a received L2 transfer (wei units)', () => {
    const ts = Date.now();
    const item: ActivityTransferItem = {
      id: 'l2:0xff', kind: 'transfer', direction: 'received', runtime: 'l2',
      counterparty: '0x3136abc0000000000000000000000000000000e4', asset: XTZ_L2_ASSET,
      amount: '500000000000000000', // 0.5 XTZ in wei
      timestamp: ts, status: 'confirmed',
      links: { primary: { explorer: 'blockscout', url: 'https://blockscout/tx/0xff' } },
    };
    const vm = activityRowVM(item, ts);
    expect(vm.verb).toBe('Received');
    expect(vm.arrow).toBe('←');
    expect(vm.amount).toEqual({ value: '0.5', sign: '+' });
    expect(vm.runtimeBadge).toBe('l2');
    expect(vm.runtimeTag).toBe('EVM');
  });

  it('projects a cross-runtime transfer with both explorer links and direction-derived tag', () => {
    const ts = Date.now();
    const item: ActivityTransferItem = {
      id: 'x:opCR', kind: 'transfer', direction: 'sent', runtime: 'cross-runtime',
      counterparty: '0x6ce4Peer000000000000000000000000000006e1c', asset: XTZ_L1_ASSET, amount: '1000000',
      timestamp: ts, status: 'confirmed',
      links: {
        primary:   { explorer: 'tzkt',       url: 'https://tzkt/opCR' },
        secondary: { explorer: 'blockscout', url: 'https://blockscout/tx/0xff' },
      },
      crossRuntime: { direction: 'tezos-to-evm', l1OpHash: 'opCR', l2TxHash: '0xff', evmEffectStatus: 'confirmed' },
    };
    const vm = activityRowVM(item, ts);
    expect(vm.runtimeBadge).toBe('cross');
    expect(vm.runtimeTag).toBe('Michelson → EVM');
    expect(vm.primaryUrl).toBe('https://tzkt/opCR');
    expect(vm.secondaryUrl).toBe('https://blockscout/tx/0xff');
  });

  it('flips runtime tag for an evm-to-tezos cross-runtime transfer', () => {
    const ts = Date.now();
    const item: ActivityTransferItem = {
      id: 'x:opET', kind: 'transfer', direction: 'sent', runtime: 'cross-runtime',
      counterparty: 'tz1SomeDestinationAddress00000000000', asset: XTZ_L2_ASSET, amount: '1000000000000000000',
      timestamp: ts, status: 'confirmed',
      links: { primary: { explorer: 'blockscout', url: 'https://blockscout/tx/0xab' } },
      crossRuntime: { direction: 'evm-to-tezos', l1OpHash: 'opET', l2TxHash: '0xab', evmEffectStatus: 'confirmed' },
    };
    const vm = activityRowVM(item, ts);
    expect(vm.runtimeBadge).toBe('cross');
    expect(vm.runtimeTag).toBe('EVM → Michelson');
    // evm-to-tezos amounts come from EVM side, so we interpret as wei.
    expect(vm.amount.value).toBe('1');
  });

  it('projects a pending transfer with "Pending · Ns" time and pending status', () => {
    const ts = Date.now() - 22_000;
    const item: ActivityTransferItem = {
      id: 'l1:p', kind: 'transfer', direction: 'sent', runtime: 'cross-runtime',
      counterparty: 'tz1Sv7DestAddress000000000000000000u8Ri', asset: USDC_ASSET, amount: '2500000',
      timestamp: ts, status: 'pending',
      links: baseLinks,
      crossRuntime: { direction: 'evm-to-tezos', l1OpHash: 'opP', evmEffectStatus: 'pending' },
    };
    const vm = activityRowVM(item, ts + 22_000);
    expect(vm.status).toBe('pending');
    expect(vm.ago).toBe('Pending · 22s');
  });

  it('projects a failed transfer (verb stays Sent, status drives copy)', () => {
    const ts = Date.now() - 25 * 60 * 60 * 1000; // ~yesterday
    const item: ActivityTransferItem = {
      id: 'l1:f', kind: 'transfer', direction: 'sent', runtime: 'l1',
      counterparty: 'tz1Recipient00000000000000000000000xZSx', asset: XTZ_L1_ASSET, amount: '1000000',
      timestamp: ts, status: 'failed', links: baseLinks,
    };
    const vm = activityRowVM(item, ts + 25 * 60 * 60 * 1000);
    expect(vm.status).toBe('failed');
    expect(vm.verb).toBe('Sent');
    expect(vm.ago).toBe('Failed');
    expect(vm.dayGroup).toBe('Yesterday');
  });

  it('projects a contract call', () => {
    const ts = Date.now();
    const item: ActivityContractCallItem = {
      id: 'l1:2', kind: 'contract-call', direction: 'sent', runtime: 'l1',
      target: 'KT1ContractAddress00000000000000000', methodSig: 'approve(address,uint256)',
      timestamp: ts, status: 'pending', links: baseLinks,
    };
    const vm = activityRowVM(item, ts);
    expect(vm.verb).toBe('Contract call');
    expect(vm.arrow).toBe('→');
    expect(vm.amount.value).toBe('');
    expect(vm.status).toBe('pending');
  });

  it('projects a signature item with EVM badge', () => {
    const ts = Date.now();
    const item: ActivitySignatureItem = {
      id: 'sig:1', kind: 'signature', origin: 'https://app.example.com',
      timestamp: ts, status: 'confirmed',
    };
    const vm = activityRowVM(item, ts);
    expect(vm.verb).toBe('Signed message');
    expect(vm.runtimeBadge).toBe('l2');
    expect(vm.runtimeTag).toBe('EVM');
    expect(vm.amount.value).toBe('');
  });

  it('projects an unknown item with neutral arrow', () => {
    const ts = Date.now();
    const item: ActivityUnknownItem = {
      id: 'l1:3', kind: 'unknown', runtime: 'l1', timestamp: ts,
      links: baseLinks, raw: { source: 'tzkt', ref: 'oo…' },
    };
    const vm = activityRowVM(item, ts);
    expect(vm.verb).toBe('Activity');
    expect(vm.arrow).toBe('·');
    expect(vm.amount.value).toBe('');
    expect(vm.status).toBe('confirmed');
  });
});
