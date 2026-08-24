/**
 * One Michelson operation: its limits, its cost ceiling, and what makes it
 * well-formed.
 *
 * Domain rather than port or adapter, because two things here are facts about
 * the chain rather than about any interface: the per-operation hard limits, and
 * the coupling between the three limit knobs through the fee floor. Both are
 * needed by the signer (to refuse an impossible operation), by the router (to
 * validate a dApp's request before prompting), and by the approval screen (to
 * state what is being consented to).
 */

import type { MichelsonV1Expression } from '@taquito/rpc';

/**
 * A COMPLETE set of operation limits, already priced by the caller.
 *
 * All three fields are required on purpose. previewnet's fee floor couples them —
 * `required_µtez = 100 + 4 × opBytes + 0.045 × declaredGas`, from
 * `mempool/filter`'s `minimal_fees: 100`, `minimal_nanotez_per_byte: 4000/1` and
 * `minimal_nanotez_per_gas_unit: 45/1` (measured 2026-08-24) — so a partial pin
 * is not a weaker pin, it is a pin whose fee no longer covers its own gas
 * declaration. Making that unrepresentable is cheaper than validating it.
 */
export interface OpLimits {
  /** Mutez, charged IN FULL — a declaration, not a ceiling. */
  fee:          number;
  /** Ceiling, billed by consumption, but priced into `fee` at 0.045 µtez/unit. */
  gasLimit:     number;
  /** Ceiling in bytes, billed per byte burned; absent from the fee formula. */
  storageLimit: number;
}

/**
 * An entrypoint and its argument, together or not at all.
 *
 * ONE field, not two, for the same reason `OpLimits` requires all three: the
 * halves are meaningless apart. An entrypoint without a value renders as a
 * contract call and forges as a plain transfer — the approval screen would name
 * an operation other than the one signed — and a value without an entrypoint is
 * silently dropped. Two independent optional fields make that representable;
 * one paired field does not.
 */
export interface OpParameter {
  entrypoint: string;
  value:      MichelsonV1Expression;
}

/** One Michelson operation to sign and inject. */
export interface OperationToSend {
  /** Any destination — a KT1 or a tz1. */
  to:          string;
  /** Decimal mutez string. */
  mutezAmount: string;
  /** Absent for a plain transfer. */
  parameter?:  OpParameter;
  /** Present only when the caller priced the operation itself. */
  limits?:     OpLimits;
}

/**
 * previewnet's per-operation ceilings, from
 * `/chains/main/blocks/head/context/constants` (measured 2026-08-24).
 *
 * An operation declaring more than these cannot be included AT ANY FEE, so a
 * request that exceeds them is refused before the user is prompted rather than
 * submitted and rejected by the node.
 */
export const HARD_GAS_LIMIT_PER_OPERATION     = 660_000;
export const HARD_STORAGE_LIMIT_PER_OPERATION = 60_000;

/**
 * previewnet `cost_per_byte`, measured 2026-08-24 — 1 mutez, not mainnet's 250.
 * Used only to state a spend ceiling to the operator, never to price an
 * operation.
 */
export const COST_PER_BYTE_MUTEZ = 1;

/**
 * The worst case an operator consents to for one pinned operation, in mutez:
 * the amount transferred, plus the fee charged in full, plus the entire storage
 * allowance burned.
 *
 * THE AMOUNT IS PART OF IT. Leaving it out made the single bold money figure on
 * the approval screen understate a value-bearing call by the whole transfer — a
 * 5 XTZ send with a 3 000 µtez fee advertised a 0.004 XTZ ceiling. Every ceremony
 * operation happens to be `amount: 0`, which is exactly why the omission was
 * invisible.
 *
 * `gasLimit` is deliberately absent — it is billed by consumption, and its effect
 * on what is actually SPENT is already inside `fee`. A consent figure that can be
 * exceeded is not consent, so this is the ceiling and not an estimate.
 *
 * `mutezAmount` is safe as a `number`: `checkOperation` refuses anything that is
 * not a whole number within `Number.MAX_SAFE_INTEGER`.
 */
export function maxOpCostMutez(limits: OpLimits, mutezAmount: string): number {
  return Number(mutezAmount) + limits.fee + limits.storageLimit * COST_PER_BYTE_MUTEZ;
}

export type OperationVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/** tz1/tz2/tz3/tz4 implicit accounts and KT1 originated contracts. */
const TEZOS_ADDRESS = /^(?:tz[1-4]|KT1)[0-9A-Za-z]{33}$/;

/** A non-negative integer, as a decimal string with no sign, point or exponent. */
const MUTEZ_AMOUNT = /^\d+$/;

/** Michelson entrypoint annotation, without the leading `%`. */
const ENTRYPOINT = /^[A-Za-z_][A-Za-z0-9_.]{0,30}$/;

function badLimit(value: number): boolean {
  return !Number.isSafeInteger(value) || value < 0;
}

/**
 * Is this operation well-formed enough to price, prompt for and sign?
 *
 * Every field here is page-supplied: it arrives as JSON inside an encrypted
 * Beacon frame, and the SDK validates none of it. So this runs BEFORE the
 * approval prompt — an operator should never be asked to confirm an operation
 * that cannot be submitted, and a malformed field must not reach Taquito, where
 * `Number(amount)` on a non-numeric string would silently become `NaN`.
 */
export function checkOperation(op: {
  destination: string;
  amount:      string;
  parameter?:  OpParameter;
  limits?:     OpLimits;
}): OperationVerdict {
  if (typeof op.destination !== 'string' || !TEZOS_ADDRESS.test(op.destination)) {
    return { ok: false, reason: `Not a Tezos address: ${JSON.stringify(op.destination)}` };
  }
  if (typeof op.amount !== 'string' || !MUTEZ_AMOUNT.test(op.amount)) {
    return {
      ok:     false,
      reason: `Amount must be a whole number of mutez as a string, got ${JSON.stringify(op.amount)}`,
    };
  }
  if (!Number.isSafeInteger(Number(op.amount))) {
    return { ok: false, reason: `Amount ${op.amount} mutez is too large to represent exactly` };
  }
  if (op.parameter != null) {
    if (typeof op.parameter.entrypoint !== 'string' || !ENTRYPOINT.test(op.parameter.entrypoint)) {
      return {
        ok:     false,
        reason: `Not a Michelson entrypoint: ${JSON.stringify(op.parameter.entrypoint)}`,
      };
    }
    // `null` is not `undefined`, so an explicit null would clear the
    // `parameter != null` guard downstream and reach the forger AFTER the operator
    // has approved. Refused here instead.
    if (op.parameter.value == null) {
      return {
        ok:     false,
        reason: `Entrypoint %${op.parameter.entrypoint} was sent without a parameter value`,
      };
    }
  }

  const limits = op.limits;
  if (limits == null) return { ok: true };

  if (badLimit(limits.fee) || badLimit(limits.gasLimit) || badLimit(limits.storageLimit)) {
    return {
      ok:     false,
      reason: 'fee, gasLimit and storageLimit must each be a non-negative whole number',
    };
  }
  if (limits.gasLimit > HARD_GAS_LIMIT_PER_OPERATION) {
    return {
      ok:     false,
      reason:
        `Declared gas ${limits.gasLimit} exceeds this chain's per-operation hard limit ` +
        `(${HARD_GAS_LIMIT_PER_OPERATION}); the operation cannot be included at any fee.`,
    };
  }
  if (limits.storageLimit > HARD_STORAGE_LIMIT_PER_OPERATION) {
    return {
      ok:     false,
      reason:
        `Declared storage ${limits.storageLimit} exceeds this chain's per-operation hard limit ` +
        `(${HARD_STORAGE_LIMIT_PER_OPERATION}); the operation cannot be included at any fee.`,
    };
  }
  return { ok: true };
}
