import { describe, expect, it } from 'vitest';
import { assetRowVM } from '../asset-row-vm';
import { XTZ_L1_ASSET, XTZ_L2_ASSET, type Erc20Asset } from '../../../domain/asset';

const TOKEN_18: Erc20Asset = {
  kind: 'erc20', address: '0xabc0000000000000000000000000000000000000',
  symbol: 'WXTZ', name: 'Wrapped XTZ', decimals: 18, runtime: 'evm',
};

const TOKEN_6: Erc20Asset = {
  kind: 'erc20', address: '0xd77420f73b4612a7a99dba8c2afd30a1886b0344',
  symbol: 'USDC', name: 'USD Coin', decimals: 6, runtime: 'evm',
};

describe('assetRowVM', () => {
  it('projects XTZ L1 with Michelson runtime label', () => {
    const vm = assetRowVM(XTZ_L1_ASSET, '1000000');
    expect(vm.id).toBe('xtz:l1');
    expect(vm.symbol).toBe('XTZ');
    expect(vm.runtimeBadge).toBe('l1');
    expect(vm.runtimeLabel).toBe('Michelson runtime');
    expect(vm.balanceFormatted).toBe('1');
  });

  it('projects XTZ L2 with EVM runtime label and wei→XTZ formatting at 18 decimals', () => {
    const vm = assetRowVM(XTZ_L2_ASSET, '1500000000000000000');
    expect(vm.id).toBe('xtz:l2');
    expect(vm.runtimeBadge).toBe('l2');
    expect(vm.runtimeLabel).toBe('EVM runtime');
    expect(vm.balanceFormatted).toBe('1.5');
  });

  it('projects a 6-decimal ERC-20 (USDC pattern)', () => {
    const vm = assetRowVM(TOKEN_6, '2500000');
    expect(vm.id).toBe('erc20:0xd77420f73b4612a7a99dba8c2afd30a1886b0344');
    expect(vm.symbol).toBe('USDC');
    expect(vm.runtimeBadge).toBe('l2');
    expect(vm.runtimeLabel).toBe('EVM runtime');
    expect(vm.balanceFormatted).toBe('2.5');
  });

  it('projects an 18-decimal ERC-20 (WXTZ pattern)', () => {
    const vm = assetRowVM(TOKEN_18, '3000000000000000000');
    expect(vm.symbol).toBe('WXTZ');
    expect(vm.balanceFormatted).toBe('3');
  });

  it('returns an empty balance string when amount is null (loading state)', () => {
    const vm = assetRowVM(TOKEN_6, null);
    expect(vm.balanceFormatted).toBe('');
  });

  it('lowercases the ERC-20 address in the id for stable React keys', () => {
    const upper: Erc20Asset = { ...TOKEN_6, address: '0xD77420F73B4612A7A99DBA8C2AFD30A1886B0344' };
    const vm = assetRowVM(upper, '0');
    expect(vm.id).toBe('erc20:0xd77420f73b4612a7a99dba8c2afd30a1886b0344');
  });
});
