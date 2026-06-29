/**
 * sendTransfer: routes a transfer across the four valid combinations of
 * source signer kind × destination runtime. Tezos sources go through
 * either the TezosSigner native L1 path or the RelayerProvider NAC
 * gateway path. EVM sources go through the EvmProvider for same-runtime
 * sends and through the NAC precompile (via buildEvmToTezosTx + the
 * EvmSigner) for cross-runtime sends.
 */

import type { CrossRuntimeIntent } from '@tezosx/relayer/types';
import { decideRoute } from '@tezosx/wallet-core/domain/transfer';
import { buildEvmToTezosTx } from '../adapters/evm/nac-precompile-builder';
import type { Container } from '../composition/container';
import type { Asset } from '@tezosx/wallet-core/domain/asset';

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
  | { runtime: 'l2'; hash: string };

export async function sendTransfer(
  req:  SendTransferReq,
  deps: SendTransferDeps,
): Promise<SendTransferResult> {
  const signer = deps.container.signer;
  const route  = decideRoute(signer.account, req.to);

  if (signer.kind === 'tezos') {
    if (req.asset.kind === 'xtz' && route.via === 'native') {
      const mutez  = (BigInt(req.amount) / 10n ** 12n).toString();
      const opHash = await signer.sendNativeTransfer(req.to, mutez);
      return { runtime: 'l1', hash: opHash };
    }
    // Cross-runtime XTZ (tz1 → 0x) or ERC-20 → NAC gateway. Returns the
    // synthetic NAC hash; the popup polls resolveTx to swap it for the
    // kernel-synthesized real EVM hash before showing "Done".
    const synthetic = await deps.container.provider.request({
      method: 'eth_sendTransaction',
      params: [{
        to:    req.to,
        value: req.amount,
        data:  req.asset.kind === 'xtz' ? '0x' : req.amount,
      }],
    }) as string;
    return { runtime: 'l2', hash: synthetic };
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
    const mutezAmount  = BigInt(req.amount) / 10n ** 12n;
    const intent: CrossRuntimeIntent = {
      kind:        'transfer',
      destination: req.to,
      amount:      mutezAmount,
    };
    const tx        = await buildEvmToTezosTx(intent, signer.account.address);

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
