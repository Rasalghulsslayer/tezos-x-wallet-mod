/**
 * SignerPort: discriminated union of TezosSignerPort (Tezos ed25519, wraps
 * Taquito) and EvmSignerPort (secp256k1, native EVM signing via
 * @noble/curves + RLP, no viem).
 */

import type { ITezosWalletClient } from '@tezosx/relayer/wallet-client';
import type { TezosAccount, EvmAccount } from '../domain/account';
import type { OperationToSend } from '../domain/tezos-operation';

export interface TezosSignerPort extends ITezosWalletClient {
  readonly kind:    'tezos';
  readonly account: TezosAccount;
  sendNativeTransfer(to: string, mutezAmount: string): Promise<string>;
  /**
   * Sign and inject one Michelson operation against an ARBITRARY destination,
   * optionally with limits the caller has already priced.
   *
   * Lives here and not on the relayer's `ITezosWalletClient` because that port is
   * also implemented by the dApp-side `BeaconClient`, which relays to a foreign
   * wallet and has no business being asked to price an operation.
   */
  sendOperation(op: OperationToSend): Promise<string>;
}

export interface EvmUnsignedTx {
  to:                    `0x${string}`;
  data:                  `0x${string}`;
  value:                 bigint;
  gasLimit:              bigint;
  nonce:                 bigint;
  chainId:               bigint;
  maxFeePerGas?:         bigint;
  maxPriorityFeePerGas?: bigint;
}

export interface EvmSignerPort {
  readonly kind:    'evm';
  readonly account: EvmAccount;
  signEvmTx(tx: EvmUnsignedTx): Promise<`0x${string}`>;
  signPersonalMessage(msg: string | Uint8Array): Promise<`0x${string}`>;
}

export type SignerPort = TezosSignerPort | EvmSignerPort;
