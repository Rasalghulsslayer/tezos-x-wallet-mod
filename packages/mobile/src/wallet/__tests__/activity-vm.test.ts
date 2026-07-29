import { describe, it, expect } from 'vitest';
import { XTZ_L1_ASSET, type Erc20Asset } from '@tezosx/wallet-core/domain/asset';
import type {
  ActivityTransferItem,
  ActivityContractCallItem,
  ActivitySignatureItem,
  ActivityUnknownItem,
} from '@tezosx/wallet-core/domain/activity';
import { toActivityRowVM } from '../activity-vm';

const links = { primary: { explorer: 'tzkt' as const, url: 'https://tzkt.example/op' } };

describe('toActivityRowVM', () => {
  it('scales an L1 XTZ transfer amount by the asset decimals (mutez → XTZ)', () => {
    const item: ActivityTransferItem = {
      id: 'l1:1', kind: 'transfer', direction: 'received', runtime: 'l1',
      counterparty: 'tz1abc', asset: XTZ_L1_ASSET, amount: '25000000', // 25 XTZ in mutez (6 decimals)
      timestamp: 1000, status: 'confirmed', links,
    };
    expect(toActivityRowVM(item)).toMatchObject({
      dir: 'in', verb: 'Received', peer: 'tz1abc', runtime: 'l1',
      amount: '25', symbol: 'XTZ', status: 'confirmed', ts: 1000,
    });
  });

  it('scales an ERC-20 transfer by its own decimals and maps sent → out', () => {
    const usdc: Erc20Asset = { kind: 'erc20', address: '0xabc', symbol: 'USDC', name: 'USD Coin', decimals: 6, runtime: 'evm' };
    const item: ActivityTransferItem = {
      id: 'l2:1', kind: 'transfer', direction: 'sent', runtime: 'l2',
      counterparty: '0xdef', asset: usdc, amount: '1500000', // 1.5 USDC (6 decimals)
      timestamp: 2000, status: 'pending', links,
    };
    expect(toActivityRowVM(item)).toMatchObject({
      dir: 'out', verb: 'Sent', amount: '1.5', symbol: 'USDC', runtime: 'l2', status: 'pending',
    });
  });

  it("maps 'cross-runtime' to the 'cross' badge", () => {
    const item: ActivityTransferItem = {
      id: 'x', kind: 'transfer', direction: 'sent', runtime: 'cross-runtime',
      counterparty: '0xabc', asset: XTZ_L1_ASSET, amount: '0', timestamp: 3, status: 'confirmed', links,
    };
    expect(toActivityRowVM(item).runtime).toBe('cross');
  });

  it('renders a contract-call with the method sig and no amount', () => {
    const item: ActivityContractCallItem = {
      id: 'c', kind: 'contract-call', runtime: 'l2', target: '0xtarget',
      methodSig: 'approve(address,uint256)', direction: 'sent', timestamp: 4, status: 'confirmed', links,
    };
    expect(toActivityRowVM(item)).toMatchObject({
      dir: 'out', verb: 'approve(address,uint256)', peer: '0xtarget', amount: '', symbol: '',
    });
  });

  it('renders a signature as an L2 "Signed" row with no amount', () => {
    const item: ActivitySignatureItem = {
      id: 's', kind: 'signature', origin: 'https://app.dapp', timestamp: 5, status: 'confirmed',
    };
    expect(toActivityRowVM(item)).toMatchObject({
      dir: 'out', verb: 'Signed', peer: 'https://app.dapp', runtime: 'l2', amount: '', symbol: '',
    });
  });

  it('renders an unknown item as a generic Transaction row', () => {
    const item: ActivityUnknownItem = {
      id: 'u', kind: 'unknown', runtime: 'l1', timestamp: 6, links,
      raw: { source: 'tzkt', ref: 'oRef' },
    };
    expect(toActivityRowVM(item)).toMatchObject({ verb: 'Transaction', peer: 'oRef', amount: '', status: 'confirmed' });
  });
});
