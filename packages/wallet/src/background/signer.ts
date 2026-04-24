import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import type { MichelsonV1Expression } from '@taquito/rpc';
import type { ITezosWalletClient, WalletPermissions } from '@tezosx/relayer/wallet-client';
import { TEZOS_L1_RPC, NAC_CONTRACT } from '@tezosx/relayer/constants';

/**
 * `ITezosWalletClient` implementation that signs Tezos operations locally
 * using a secret key held in SW memory. Replaces the Beacon/Temple backend
 * so the wallet is self-sufficient.
 */
export class LocalSignerClient implements ITezosWalletClient {
  private readonly toolkit:    TezosToolkit;
  private readonly permissions: WalletPermissions;

  constructor(secretKey: string, publicKey: string, tz1: string) {
    this.permissions = { address: tz1, publicKey };
    this.toolkit     = new TezosToolkit(TEZOS_L1_RPC);
    this.toolkit.setProvider({ signer: new InMemorySigner(secretKey) });
  }

  async getActiveAccount(): Promise<WalletPermissions | null> {
    return this.permissions;
  }

  setAccountChangeHandler(_cb: (tz1: string | null) => void): void {
    // The wallet owns its account; no external change source.
  }

  async requestPermissions(): Promise<WalletPermissions> {
    return this.permissions;
  }

  async sendContractCall(
    entrypoint:   string,
    michelineArg: MichelsonV1Expression,
    mutezAmount = '0',
  ): Promise<string> {
    try {
      const op = await this.toolkit.contract.transfer({
        to:        NAC_CONTRACT,
        amount:    Number(mutezAmount),
        mutez:     true,
        parameter: { entrypoint, value: michelineArg },
      });
      console.info('[TezosX Wallet] L1 opHash:', op.hash);
      return op.hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] Taquito transfer failed',
        { name: e.name, message: e.message, errors: e.errors, raw: err });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // The keyring handles lock/clear; the signer is one-shot per unlock.
  }
}
