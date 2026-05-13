/**
 * EvmSigner: EvmSignerPort implementation backed by a secp256k1 private
 * key held in SW memory. Wraps shared/evm-signing for EIP-1559 tx signing
 * and EIP-191 personal_sign.
 */

import type { EvmSignerPort, EvmUnsignedTx } from '../../ports/signer-port';
import type { EvmAccount } from '../../domain/account';
import { signTransaction1559, signPersonalMessage } from '../../shared/evm-signing';

export class EvmSigner implements EvmSignerPort {
  readonly kind = 'evm' as const;

  constructor(
    readonly account: EvmAccount,
    private readonly privateKeyHex: string,
  ) {}

  async signEvmTx(tx: EvmUnsignedTx): Promise<`0x${string}`> {
    return signTransaction1559(
      {
        chainId:              tx.chainId,
        nonce:                tx.nonce,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? 0n,
        maxFeePerGas:         tx.maxFeePerGas         ?? 0n,
        gasLimit:             tx.gasLimit,
        to:                   tx.to,
        value:                tx.value,
        data:                 tx.data,
      },
      this.privateKeyHex,
    );
  }

  async signPersonalMessage(msg: string | Uint8Array): Promise<`0x${string}`> {
    return signPersonalMessage(msg, this.privateKeyHex);
  }
}
