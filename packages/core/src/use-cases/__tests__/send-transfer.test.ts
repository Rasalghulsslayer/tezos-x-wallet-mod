/**
 * send-transfer — the two audit regressions:
 *  - VAL-2: native tz1→tz1 / EVM→tz1 must reject sub-mutez precision instead
 *    of flooring it away silently.
 *  - VAL-1: a tz1-source ERC-20 send must sign a real transfer(address,uint256)
 *    to the token contract (value 0), not the raw amount as calldata.
 * Only the fields the tz1 paths touch are mocked on the Container.
 */

import { describe, expect, it, vi } from 'vitest';
import { sendTransfer } from '../send-transfer';
import { SubMutezPrecisionError } from '@tezosx/relayer/use-cases/build-tezos-to-evm-call';
import { encodeErc20Transfer } from '@tezosx/relayer/evm';
import type { Container } from '../../ports/container';
import type { Asset } from '../../domain/asset';

const TZ1 = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb';
const RECIPIENT_TZ1 = 'tz1burnburnburnburnburnburnburjAYjjX';
const RECIPIENT_0X = '0x1111111111111111111111111111111111111111';
const TOKEN = '0xd77420f73b4612a7a99dba8c2afd30a1886b0344';
const USDC: Asset = { kind: 'erc20', address: TOKEN, symbol: 'USDC', name: 'USD Coin', decimals: 6, runtime: 'evm' };
const XTZ_L1: Asset = { kind: 'xtz', symbol: 'XTZ', decimals: 6, runtime: 'michelson' };

function tezosContainer(providerRequest: (args: { method: string; params?: unknown[] }) => Promise<unknown>) {
  const sendNativeTransfer = vi.fn(async () => 'op-hash');
  const container = {
    signer:   { kind: 'tezos', account: { kind: 'tezos', id: 'a', tz1: TZ1, publicKey: 'edpk', createdAt: 0 }, sendNativeTransfer },
    provider: { request: vi.fn(providerRequest), resolveSyntheticHash: vi.fn(async () => null), getPendingL1Hash: vi.fn(() => null) },
  } as unknown as Container;
  return { container, sendNativeTransfer };
}

describe('send-transfer — VAL-2 sub-mutez rejection (native tz1→tz1)', () => {
  it('rejects an amount with sub-mutez precision instead of flooring it', async () => {
    const { container, sendNativeTransfer } = tezosContainer(async () => 'unused');
    // 1 wei — far below 1 mutez (10^12 wei).
    await expect(
      sendTransfer({ to: RECIPIENT_TZ1, amount: '0x1', asset: XTZ_L1 }, { container }),
    ).rejects.toBeInstanceOf(SubMutezPrecisionError);
    expect(sendNativeTransfer).not.toHaveBeenCalled();
  });

  it('accepts an exact-mutez amount and forwards the mutez value', async () => {
    const { container, sendNativeTransfer } = tezosContainer(async () => 'unused');
    // 2 mutez = 2 * 10^12 wei.
    await sendTransfer({ to: RECIPIENT_TZ1, amount: '0x1d1a94a2000', asset: XTZ_L1 }, { container });
    expect(sendNativeTransfer).toHaveBeenCalledWith(RECIPIENT_TZ1, '2');
  });
});

describe('send-transfer — UX-7 self-send guard', () => {
  it('rejects sending to the account\'s own tz1', async () => {
    const { container, sendNativeTransfer } = tezosContainer(async () => 'unused');
    await expect(
      sendTransfer({ to: TZ1, amount: '0x1d1a94a2000', asset: XTZ_L1 }, { container }),
    ).rejects.toThrow(/own address/i);
    expect(sendNativeTransfer).not.toHaveBeenCalled();
  });
});

describe('send-transfer — VAL-1 ERC-20 from tz1 signs a real ABI transfer', () => {
  it('routes to the token contract with value 0x0 and encoded transfer calldata', async () => {
    const captured: { method: string; params?: unknown[] }[] = [];
    const { container } = tezosContainer(async (args) => { captured.push(args); return 'synthetic-hash'; });

    // 5 USDC at 6 decimals = 5_000_000 base units.
    const result = await sendTransfer({ to: RECIPIENT_0X, amount: '0x4c4b40', asset: USDC }, { container });

    expect(result).toMatchObject({ runtime: 'l2', hash: 'synthetic-hash' });
    const call = captured.find((c) => c.method === 'eth_sendTransaction');
    expect(call).toBeDefined();
    const tx = (call!.params as { to: string; value: string; data: string }[])[0];
    expect(tx.to).toBe(TOKEN);          // the token contract, not the recipient
    expect(tx.value).toBe('0x0');       // no native value on an ERC-20 transfer
    expect(tx.data).toBe(encodeErc20Transfer(RECIPIENT_0X, 5_000_000n));
    expect(tx.data.startsWith('0xa9059cbb')).toBe(true);  // transfer(address,uint256) selector
  });
});
