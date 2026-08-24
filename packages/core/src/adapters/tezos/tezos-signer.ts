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
 *
 * ── TWO PRICING MODES, AND WHY BOTH ARE NECESSARY ────────────────────────────
 *
 * `sendOperation` accepts an already-priced operation and submits it VERBATIM.
 * That is not a shortcut around the logic above — it is the only correct
 * behaviour for an operation a dApp priced itself, for a reason that has already
 * cost this chain a working integration:
 *
 *   - A dApp that pins fee/gas/storage derives the fee FROM the gas it declares,
 *     against this chain's published floor. previewnet's `mempool/filter` serves
 *     `minimal_fees: 100`, `minimal_nanotez_per_gas_unit: 45/1`,
 *     `minimal_nanotez_per_byte: 4000/1` (measured 2026-08-24), i.e.
 *     `required_µtez = 100 + 4 × opBytes + 0.045 × declaredGas`. The byte term is
 *     4000× mainnet's and the gas term 450×, so the three knobs are not
 *     independent: raising the declared gas without raising the fee puts the
 *     operation UNDER the floor and it is refused at the prevalidator.
 *   - So re-estimating one knob of a supplied pin breaks the other two. Honour
 *     all three or none.
 *   - And an operation with NO pricing is not safe to guess at either: a wallet
 *     that prices previewnet from L1 intuitions lands ~20% under the floor, the
 *     node answers `evm_node.dev.insufficient_fees` at preapply, and the dApp
 *     sees a generic abort with no diagnosis. That is precisely the failure that
 *     made Temple unusable here.
 *
 * Hence: a complete pin is submitted as given, and an absent pin falls through to
 * `transferWithBufferedFees` — the calibrated `mempool/filter` + buffer + retry
 * path, which is what a delegating dApp is asking for.
 */

import { TezosToolkit, type TransferParams } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import type { MichelsonV1Expression } from '@taquito/rpc';
import type { WalletPermissions } from '@tezosx/relayer/wallet-client';
import { TEZOS_L1_RPC, NAC_CONTRACT } from '@tezosx/relayer/constants';
import type { TezosSignerPort } from '../../ports/signer-port';
import {
  HARD_GAS_LIMIT_PER_OPERATION,
  HARD_STORAGE_LIMIT_PER_OPERATION,
  type OperationToSend,
  type OpLimits,
} from '../../domain/tezos-operation';
import type { TezosAccount } from '../../domain/account';
import { devLog } from '../../shared/log';

/**
 * Volatility headroom over Taquito's suggested fee. The Tezos X gas price is
 * dynamic (congestion-based) and can rise between estimation and inclusion, so
 * we pad the fee. The gas/storage *limits* are deterministic and left as-is;
 * the retry path still covers a residual under-shoot.
 */
const FEE_BUFFER = 1.5;

/**
 * Ceiling on the one-shot fee retry. The retry trusts the `required` value the
 * node reports in an insufficient_fees rejection; a buggy or hostile RPC could
 * report an absurd figure and drain the balance in fees. A genuine under-shoot
 * past the FEE_BUFFER pad is small, so we refuse any `required` beyond this
 * multiple of the already-padded fee rather than resubmit blindly.
 */
const MAX_RETRY_FEE_MULTIPLE = 4;

/**
 * Beacon-style ceilings for NAC `call_evm` operations. Tezlink's run_operation
 * rejects simulation with `tezlink_error` when default gas budgets are too low
 * for the EVM sub-call. Submitting directly with these ceilings (matching the
 * Beacon path) lets the kernel allocate what it needs.
 */
/**
 * ⚠️ `CALL_EVM_GAS_LIMIT` below is 1_040_000, i.e. 1.58× this chain's measured
 * `hard_gas_limit_per_operation` of 660_000 (see `domain/tezos-operation.ts`).
 * That fallback therefore cannot produce an includable operation on previewnet.
 * Left untouched because it only runs after the primary path has already failed
 * and its callers are out of scope here — reported rather than changed.
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
      // Trust the node's `required` only within a bounded multiple of our
      // padded fee — beyond that we surface the original rejection rather than
      // pay an unbounded amount.
      if (required > computed * MAX_RETRY_FEE_MULTIPLE) throw err;
      const op = await submit(required);
      return op.hash;
    }
  }

  /**
   * The one place a Michelson operation's `TransferParams` is shaped, so the
   * NAC path and the generalised path cannot drift. `entrypoint` and
   * `michelineArg` travel together: an operation with neither is a plain
   * transfer, which Taquito expresses by omitting `parameter` entirely.
   */
  private buildParams(op: {
    to:            string;
    mutezAmount:   string;
    entrypoint?:   string;
    michelineArg?: MichelsonV1Expression;
  }): TransferParams {
    const params: TransferParams = {
      to:     op.to,
      amount: Number(op.mutezAmount),
      mutez:  true,
    };
    if (op.entrypoint != null && op.michelineArg !== undefined) {
      params.parameter = { entrypoint: op.entrypoint, value: op.michelineArg };
    }
    return params;
  }

  /**
   * Submit an operation exactly as priced by its caller — no estimate, no
   * buffer, no retry. See the header: the three knobs are interdependent through
   * this chain's fee floor, so adjusting one silently invalidates the others.
   */
  private async submitWithLimits(params: TransferParams, limits: OpLimits): Promise<string> {
    if (limits.gasLimit > HARD_GAS_LIMIT_PER_OPERATION) {
      throw new Error(
        `Declared gas ${limits.gasLimit} exceeds previewnet's ` +
        `hard_gas_limit_per_operation (${HARD_GAS_LIMIT_PER_OPERATION}); the operation ` +
        'cannot be included at any fee.',
      );
    }
    if (limits.storageLimit > HARD_STORAGE_LIMIT_PER_OPERATION) {
      throw new Error(
        `Declared storage ${limits.storageLimit} exceeds previewnet's ` +
        `hard_storage_limit_per_operation (${HARD_STORAGE_LIMIT_PER_OPERATION}); the ` +
        'operation cannot be included at any fee.',
      );
    }
    const op = await this.toolkit.contract.transfer({
      ...params,
      fee:          limits.fee,
      gasLimit:     limits.gasLimit,
      storageLimit: limits.storageLimit,
    });
    return op.hash;
  }

  /**
   * Sign and inject ONE Michelson operation against an arbitrary destination.
   *
   * The generalised send. `sendContractCall` remains the NAC-gateway-specific
   * entry point its callers depend on; this one takes `to` because the native
   * ceremony targets three different kinds of destination — the per-role
   * originator KT1s, the child KT1s (`setAdmin`), and the gateway (`call_evm`) —
   * and none of them is knowable from an entrypoint name.
   *
   * `limits` present  → submitted verbatim (the dApp priced it; see the header).
   * `limits` absent   → priced here by the calibrated buffered-fee path.
   *
   * Deliberately does NOT reuse the `call_evm` fixed-ceiling fallback, even when
   * the entrypoint is `call_evm`. Three reasons, in order of weight: the caller
   * on this path has already priced the operation against the live chain, so
   * overriding its pin after a simulation failure would substitute a guess for a
   * measurement; the fallback's 1_040_000 gas exceeds this chain's measured
   * 660_000 hard limit and so cannot be included at any fee; and the fallback was
   * calibrated for the NAC gateway specifically, whose kernel provisions an inner
   * EVM frame from the declared L1 limit — a property no per-role originator or
   * child KT1 shares.
   */
  async sendOperation(op: OperationToSend): Promise<string> {
    const params = this.buildParams(op);
    try {
      const hash = op.limits != null
        ? await this.submitWithLimits(params, op.limits)
        : await this.transferWithBufferedFees(params);
      devLog.info('[TezosX Wallet] L1 opHash:', hash);
      return hash;
    } catch (err) {
      const e = err as { errors?: unknown[]; message?: string; name?: string };
      console.error('[TezosX Wallet] operation failed',
        { to: op.to, entrypoint: op.entrypoint, pinned: op.limits != null,
          name: e.name, message: e.message, errors: e.errors });
      throw err;
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
    const params = this.buildParams({ to: NAC_CONTRACT, mutezAmount, entrypoint, michelineArg });

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
