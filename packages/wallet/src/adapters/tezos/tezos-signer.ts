/**
 * TezosSigner: TezosSignerPort implementation backed by a tz1 secret key
 * held in SW memory. Wraps Taquito's InMemorySigner and TezosToolkit for
 * op injection.
 *
 * Fees: Taquito >= 24.3 derives `suggestedFeeMutez` from the live
 * `mempool/filter` schedule on every estimate (dynamic gas price + DA byte
 * fee), so it is already kernel-correct for Tezos X. We use it directly and
 * apply a volatility buffer on top (the gas price is congestion-based and can
 * rise between estimate and inclusion). A residual insufficient_fees rejection
 * is retried once with the kernel-reported `required` value.
 */

import { TezosToolkit, type TransferParams } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import type { MichelsonV1Expression } from '@taquito/rpc';
import type { WalletPermissions } from '@tezosx/relayer/wallet-client';
import { TEZOS_L1_RPC, NAC_CONTRACT } from '@tezosx/relayer/constants';
import type { TezosSignerPort } from '@tezosx/wallet-core/ports/signer-port';
import type { TezosAccount } from '@tezosx/wallet-core/domain/account';
import { devLog } from '../../shared/log';

/**
 * Volatility headroom over Taquito's suggested fee. The Tezos X gas price is
 * dynamic (congestion-based) and can rise between estimation and inclusion, so
 * we pad the fee. The gas/storage *limits* are deterministic and left as-is;
 * the retry path still covers a residual under-shoot.
 */
const FEE_BUFFER = 1.5;

/**
 * Beacon-style ceilings for NAC `call_evm` operations. Tezlink's run_operation
 * rejects simulation with `tezlink_error` when default gas budgets are too low
 * for the EVM sub-call. Submitting directly with these ceilings (matching the
 * Beacon path) lets the kernel allocate what it needs.
 */
const CALL_EVM_GAS_LIMIT     = 1_040_000;
const CALL_EVM_STORAGE_LIMIT = 60_000;
const CALL_EVM_FEE_MUTEZ     = 100_000;

function isTezlinkSimError(err: unknown): boolean {
  const e = err as { message?: string; errors?: unknown };
  const msg = e.message ?? '';
  if (msg.includes('tezlink_error')) return true;
  const errs = JSON.stringify(e.errors ?? '');
  return errs.includes('tezlink_error');
}

function extractRequiredFee(err: unknown): number | null {
  const e = err as { message?: string; errors?: unknown };
  const haystack = JSON.stringify(e.errors ?? '') + ' ' + (e.message ?? '');
  const m = haystack.match(/"required"\s*:\s*"?([\d.]+)"?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  return n < 1 ? Math.ceil(n * 1_000_000) : Math.ceil(n);
}

export class TezosSigner implements TezosSignerPort {
  readonly kind = 'tezos' as const;
  private readonly toolkit:     TezosToolkit;
  private readonly permissions: WalletPermissions;

  constructor(
    readonly account: TezosAccount,
    secretKey:        string,
  ) {
    this.permissions = { address: account.tz1, publicKey: account.publicKey };
    this.toolkit     = new TezosToolkit(TEZOS_L1_RPC);
    this.toolkit.setProvider({ signer: new InMemorySigner(secretKey) });
  }

  async getActiveAccount(): Promise<WalletPermissions | null> {
    return this.permissions;
  }

  setAccountChangeHandler(_cb: (tz1: string | null) => void): void {}

  async requestPermissions(): Promise<WalletPermissions> {
    return this.permissions;
  }

  private async transferWithBufferedFees(params: TransferParams): Promise<string> {
    // Taquito >= 24.3 derives suggestedFeeMutez from the live mempool/filter
    // schedule (dynamic gas price + DA byte fee), so it is kernel-correct for
    // Tezos X. We only pad it for volatility between estimate and inclusion.
    const est      = await this.toolkit.estimate.transfer(params);
    const computed = Math.ceil(est.suggestedFeeMutez * FEE_BUFFER);

    const submit = (fee: number) =>
      this.toolkit.contract.transfer({
        ...params,
        fee,
        gasLimit:     est.gasLimit,
        storageLimit: est.storageLimit + 1,
      });

    try {
      const op = await submit(computed);
      return op.hash;
    } catch (err) {
      const required = extractRequiredFee(err);
      if (required === null || required <= computed) throw err;
      const op = await submit(required);
      return op.hash;
    }
  }

  private async submitWithFixedCeilings(params: TransferParams): Promise<string> {
    const op = await this.toolkit.contract.transfer({
      ...params,
      fee:          CALL_EVM_FEE_MUTEZ,
      gasLimit:     CALL_EVM_GAS_LIMIT,
      storageLimit: CALL_EVM_STORAGE_LIMIT,
    });
    return op.hash;
  }

  async sendContractCall(
    entrypoint:   string,
    michelineArg: MichelsonV1Expression,
    mutezAmount = '0',
  ): Promise<string> {
    const params: TransferParams = {
      to:        NAC_CONTRACT,
      amount:    Number(mutezAmount),
      mutez:     true,
      parameter: { entrypoint, value: michelineArg },
    };

    try {
      const hash = await this.transferWithBufferedFees(params);
      devLog.info('[TezosX Wallet] L1 opHash:', hash);
      return hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] Taquito estimate failed',
        { name: e.name, message: e.message, errors: e.errors, raw: err });

      if (entrypoint === 'call_evm' && isTezlinkSimError(err)) {
        devLog.warn('[TezosX Wallet] retrying call_evm with fixed ceilings (Beacon-style fallback)');
        try {
          const hash = await this.submitWithFixedCeilings(params);
          devLog.info('[TezosX Wallet] L1 opHash (fallback):', hash);
          return hash;
        } catch (retryErr) {
          const r = retryErr as { errors?: unknown[]; message?: string; name?: string };
          console.error('[TezosX Wallet] fallback submit failed',
            { name: r.name, message: r.message, errors: r.errors, raw: retryErr });
          throw retryErr;
        }
      }
      throw err;
    }
  }

  async sendNativeTransfer(to: string, mutezAmount: string): Promise<string> {
    try {
      const hash = await this.transferWithBufferedFees({
        to,
        amount: Number(mutezAmount),
        mutez:  true,
      });
      devLog.info('[TezosX Wallet] L1 native opHash:', hash);
      return hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] Taquito native transfer failed',
        { name: e.name, message: e.message, errors: e.errors, raw: err });
      throw err;
    }
  }

  async disconnect(): Promise<void> {}
}
