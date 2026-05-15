import type { MichelsonV1Expression } from '@taquito/rpc';

/** Shape of a wallet permission response (tz1 + publicKey). */
export interface WalletPermissions {
  address:   string;
  publicKey: string;
}

/**
 * Abstraction over any Tezos wallet backend capable of signing operations
 * and reporting its active account. `BeaconClient` implements this for
 * Temple/Beacon; a standalone wallet can implement it with a local signer.
 */
export interface ITezosWalletClient {
  getActiveAccount(): Promise<WalletPermissions | null>;
  setAccountChangeHandler(cb: (tz1: string | null) => void): void;
  requestPermissions(): Promise<WalletPermissions>;
  sendContractCall(
    entrypoint:   string,
    michelineArg: MichelsonV1Expression,
    mutezAmount?: string,
  ): Promise<string>;
  disconnect(): Promise<void>;
}
