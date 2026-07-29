/**
 * sendTransfer: routes a transfer across the four valid combinations of
 * source signer kind × destination runtime. Tezos sources go through
 * either the TezosSigner native L1 path or the RelayerProvider NAC
 * gateway path. EVM sources go through the EvmProvider for same-runtime
 * sends and through the NAC precompile (via buildEvmToTezosTx + the
 * EvmSigner) for cross-runtime sends.
 */

import type { CrossRuntimeIntent } from '@tezosx/relayer/types';
import { weiToMutezExact } from '@tezosx/relayer/use-cases/build-tezos-to-evm-call';
import { encodeErc20Transfer } from '@tezosx/relayer/evm';
import { decideRoute } from '../domain/transfer';
import type { Container } from '../ports/container';
import type { Asset } from '../domain/asset';

export interface SendTransferReq {
  to:     string;
  amount: string;                // 0x-prefixed hex wei
  asset:  Asset;
}

export interface SendTransferDeps {
  container: Container;
}

export type SendTransferResult =
  | { runtime: 'l1'; hash: string }
  // For the NAC gateway path, `l1OpHash` is the underlying L1 operation —
  // its inclusion is observable on TzKT long before the kernel-synthesized
  // EVM hash resolves, so status tracking can report progress in between.
  | { runtime: 'l2'; hash: string; l1OpHash?: string };

export async function sendTransfer(
  req:  SendTransferReq,
  deps: SendTransferDeps,
): Promise<SendTransferResult> {
  const signer = deps.container.signer;

  // Reject a same-address self-send (tz1 → its own tz1, 0x → its own 0x): it
  // only burns fees. A tz1 → its own EVM alias is allowed (that's alias
  // forwarding, a real operation).
  const ownAddress = signer.kind === 'tezos' ? signer.account.tz1 : signer.account.address;
  if (req.to.trim().toLowerCase() === ownAddress.toLowerCase()) {
    throw new Error('Cannot send to your own address');
  }

  const route  = decideRoute(signer.account, req.to);

  if (signer.kind === 'tezos') {
    if (req.asset.kind === 'xtz' && route.via === 'native') {
      // Reject sub-mutez precision rather than flooring it away silently — the
      // same no-silent-loss rule the NAC gateway boundary already enforces.
      const mutez  = weiToMutezExact(BigInt(req.amount)).toString();
      const opHash = await signer.sendNativeTransfer(req.to, mutez);
      return { runtime: 'l1', hash: opHash };
    }
    // Cross-runtime → NAC gateway. Returns the synthetic NAC hash; the popup
    // polls resolveTx to swap it for the kernel-synthesized real EVM hash
    // before showing "Done".
    //
    // XTZ: a bare value transfer to the recipient (value carried, no calldata).
    // ERC-20: a real `transfer(recipient, amount)` ABI call to the *token
    // contract* (value 0) — `req.amount` is already in the token's base units.
    // Encoding the raw amount as calldata (the previous behaviour) signed
    // gibberish that the gateway rejected as an unknown selector.
    const tx = req.asset.kind === 'erc20'
      ? { to: req.asset.address, value: '0x0', data: encodeErc20Transfer(req.to, BigInt(req.amount)) }
      : { to: req.to, value: req.amount, data: '0x' };
    const synthetic = await deps.container.provider.request({
      method: 'eth_sendTransaction',
      params: [tx],
    }) as string;
    const l1OpHash = deps.container.provider.getPendingL1Hash?.(synthetic) ?? undefined;
    return { runtime: 'l2', hash: synthetic, l1OpHash };
  }

  // EVM signer paths
  if (req.asset.kind !== 'xtz') {
    throw new Error(`EVM-source ${req.asset.symbol} transfers are not supported in 0.7.0`);
  }

  if (route.via === 'native') {
    // EVM-to-EVM XTZ transfer through EvmProvider; returns the real EVM hash.
    const hash = await deps.container.provider.request({
      method: 'eth_sendTransaction',
      params: [{ to: req.to, value: req.amount, data: '0x' }],
    }) as string;
    return { runtime: 'l2', hash };
  }

  if (route.via === 'nac-precompile-l2') {
    // EVM → tz1 via NAC precompile. The relayer's buildCrossRuntimeTx
    // produces a fully-populated EVM tx; the EvmSigner signs it; the
    // EvmProvider broadcasts via eth_sendRawTransaction.
    const mutezAmount  = weiToMutezExact(BigInt(req.amount));
    const intent: CrossRuntimeIntent = {
      kind:        'transfer',
      destination: req.to,
      amount:      mutezAmount,
    };
    const tx        = await deps.container.crossRuntimeBuilder.buildEvmToTezosTx(intent, signer.account.address);

    const gasPriceHex = await deps.container.provider.request({ method: 'eth_gasPrice' }) as string;
    const maxFeePerGas = BigInt(gasPriceHex) * 2n;

    const rawSigned = await signer.signEvmTx({
      to:                   tx.to,
      data:                 tx.data,
      value:                tx.value,
      gasLimit:             tx.gasLimit,
      nonce:                tx.nonce,
      chainId:              tx.chainId,
      maxFeePerGas,
      maxPriorityFeePerGas: 0n,
    });
    const hash = await deps.container.provider.request({
      method: 'eth_sendRawTransaction',
      params: [rawSigned],
    }) as string;
    return { runtime: 'l2', hash };
  }

  throw new Error(`Unsupported route: ${JSON.stringify(route)}`);
}
