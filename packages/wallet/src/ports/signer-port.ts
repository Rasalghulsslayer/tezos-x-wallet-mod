/**
 * SignerPort: discriminated union of TezosSignerPort and EvmSignerPort.
 * EvmSignerPort is a placeholder type until W4 populates the EVM-side
 * signing surface.
 */

import type { ITezosWalletClient } from '@tezosx/relayer/wallet-client';
import type { TezosAccount } from '../domain/account';

export interface TezosSignerPort extends ITezosWalletClient {
  readonly kind:    'tezos';
  readonly account: TezosAccount;
  sendNativeTransfer(to: string, mutezAmount: string): Promise<string>;
}

export interface EvmSignerPort {
  readonly kind: 'evm';
}

export type SignerPort = TezosSignerPort | EvmSignerPort;
