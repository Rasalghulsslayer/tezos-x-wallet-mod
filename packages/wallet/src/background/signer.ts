import { TezosToolkit, type TransferParams } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import type { MichelsonV1Expression } from '@taquito/rpc';
import type { ITezosWalletClient, WalletPermissions } from '@tezosx/relayer/wallet-client';
import { TEZOS_L1_RPC, NAC_CONTRACT } from '@tezosx/relayer/constants';

/**
 * Buffer applied on top of Taquito's auto-estimate to absorb Previewnet
 * fee variance. The kernel sometimes requires ~10–20% more than the node
 * estimate returns, so we round each component up.
 */
const FEE_BUFFER     = 1.2;   // +20% on suggestedFeeMutez
const GAS_BUFFER     = 1.2;   // +20% on gasLimit
const STORAGE_BUFFER = 1.5;   // +50% on storageLimit (small numbers, large variance)

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

  /**
   * Transfer with explicit fee/gas/storage buffers. Taquito's default auto-
   * estimate uses the bare node estimate, which Previewnet's kernel can reject
   * with `evm_node.dev.insufficient_fees`. We pre-estimate and pad before
   * submitting so the op is accepted on the first try.
   */
  private async transferWithBufferedFees(params: TransferParams): Promise<string> {
    const est = await this.toolkit.estimate.transfer(params);
    const op = await this.toolkit.contract.transfer({
      ...params,
      fee:          Math.ceil(est.suggestedFeeMutez * FEE_BUFFER),
      gasLimit:     Math.ceil(est.gasLimit         * GAS_BUFFER),
      storageLimit: Math.ceil(est.storageLimit     * STORAGE_BUFFER) + 1,
    });
    return op.hash;
  }

  async sendContractCall(
    entrypoint:   string,
    michelineArg: MichelsonV1Expression,
    mutezAmount = '0',
  ): Promise<string> {
    try {
      const hash = await this.transferWithBufferedFees({
        to:        NAC_CONTRACT,
        amount:    Number(mutezAmount),
        mutez:     true,
        parameter: { entrypoint, value: michelineArg },
      });
      console.info('[TezosX Wallet] L1 opHash:', hash);
      return hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] Taquito transfer failed',
        { name: e.name, message: e.message, errors: e.errors, raw: err });
      throw err;
    }
  }

  /** Native L1 transfer (no NAC, no CRAC). Used for same-runtime XTZ sends. */
  async sendNativeTransfer(to: string, mutezAmount: string): Promise<string> {
    try {
      const hash = await this.transferWithBufferedFees({
        to,
        amount: Number(mutezAmount),
        mutez:  true,
      });
      console.info('[TezosX Wallet] L1 native opHash:', hash);
      return hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] Taquito native transfer failed',
        { name: e.name, message: e.message, errors: e.errors, raw: err });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    // The keyring handles lock/clear; the signer is one-shot per unlock.
  }
}
