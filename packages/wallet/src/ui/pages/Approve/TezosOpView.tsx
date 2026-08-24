/**
 * The approval screen for a native Michelson operation from a Beacon dApp.
 *
 * ── WHY THIS IS NOT `TxView` ─────────────────────────────────────────────────
 *
 * `TxView` describes an EVM transaction: a `0x` destination, a wei value, ABI
 * calldata, and — for a tz1 account — the NAC gateway call the wallet will
 * actually sign underneath. None of that applies here. A Beacon operation IS the
 * thing being signed: a Michelson destination, a mutez amount, an entrypoint and
 * a Micheline parameter. Reusing `TxView` would mean filling EVM fields with
 * Michelson values, i.e. an approval screen that names an operation other than
 * the one the key is about to sign.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 *
 * It does not decode the parameter. The destination is arbitrary — a per-role
 * originator, a child KT1, the gateway — and the wallet has no ABI for any of
 * them, so a friendly summary would be a claim it cannot stand behind. The raw
 * Micheline is shown instead, truncated, and labelled as raw.
 *
 * It states a spend CEILING rather than an estimate, and only when the dApp
 * priced the operation: fee is charged in full and the storage allowance is
 * billed per byte burned, so `fee + storageLimit × cost_per_byte` is the most
 * this can cost. When the dApp delegated pricing there is no ceiling to state
 * yet, and a consent figure that can be exceeded is not consent — so it says so
 * instead of inventing one.
 */

import { useMemo } from 'react';
import type { PendingRequest } from '@tezosx/wallet-core/shared/messages';
import { originDisplay } from '@tezosx/wallet-core/shared/approval-display';
import { formatTokenAmount, shortAddr } from '@tezosx/wallet-core/shared/format';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { Line } from '../../tx/Line';
import { ApprovalHeader } from './ApprovalHeader';
import { PinnedChip } from './PinnedChip';
import type { AccountContext } from './types';

/**
 * XTZ has 6 decimals on the Michelson runtime, so mutez are its smallest unit.
 * Shown as XTZ for legibility with the exact mutez underneath — the operator
 * consents to a mutez figure, and rounding it away in the only place it appears
 * would be the wrong kind of tidy.
 */
function xtz(mutez: string): string {
  return `${formatTokenAmount(mutez, 6)} XTZ`;
}

export function TezosOpView({
  pending, respond, ctx,
}: {
  pending: Extract<PendingRequest, { kind: 'tezos-operation' }>;
  respond: (d: 'approve' | 'reject') => void;
  ctx:     AccountContext | null;
}) {
  const hostname = useMemo(() => originDisplay(pending.origin).title, [pending.origin]);
  const isCall   = pending.entrypoint != null;
  const amount   = xtz(pending.amount);

  return (
    <div className="tx-approval">
      <ApprovalHeader
        origin={pending.origin}
        subtitle={isCall ? 'Contract call' : 'Tezos transfer'}
        accent="purple"
      />

      <div className="tx-page-scroll" style={{ padding: 16 }}>
        <PinnedChip ctx={ctx} />
        <div className="tx-kicker" style={{ marginBottom: 6 }}>Requesting</div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 14 }}>
          {isCall ? `Call %${pending.entrypoint}` : `Send ${amount}`}
        </div>

        <div className="tx-risk" style={{ marginBottom: 14 }}>
          <Icon name="shield" size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Signs a Tezos operation</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              {hostname} asked for this operation. The wallet cannot read what the
              contract will do with it — check the destination and entrypoint.
            </div>
          </div>
          <span className="bars"><span className="on" /><span className="on" /><span /></span>
        </div>

        <div className="tx-card" style={{ padding: 0 }}>
          <Line label="Destination" value={shortAddr(pending.destination)} sub={pending.destination} />
          <div className="tx-divider" />
          {isCall && (
            <>
              <Line label="Entrypoint" value={`%${pending.entrypoint}`} />
              <div className="tx-divider" />
            </>
          )}
          <Line label="Amount" value={amount} sub={`${pending.amount} mutez`} strong={!isCall} />

          {pending.limits != null && (
            <>
              <div className="tx-divider" />
              <Line
                label="Fee"
                value={xtz(String(pending.limits.fee))}
                sub={`${pending.limits.fee} mutez — charged in full, as declared`}
              />
              <div className="tx-divider" />
              <Line
                label="Limits"
                value={`${pending.limits.gasLimit.toLocaleString()} gas`}
                sub={`${pending.limits.storageLimit.toLocaleString()} bytes storage`}
              />
            </>
          )}
        </div>

        {pending.maxCostMutez != null ? (
          <div className="tx-card" style={{ padding: 0, marginTop: 12 }}>
            <Line
              label="Most this can cost"
              value={xtz(pending.maxCostMutez)}
              sub={`${pending.maxCostMutez} mutez — fee in full + the whole storage allowance`}
              strong
            />
          </div>
        ) : (
          <div className="tx-risk" style={{ marginTop: 12 }}>
            <Icon name="shield" size={16} />
            <div style={{ flex: 1, fontSize: 11, opacity: 0.9 }}>
              {hostname} left the fee to the wallet, so the final cost is not known
              yet and cannot be shown as a ceiling here.
            </div>
          </div>
        )}

        {pending.parametersPreview != null && (
          <>
            <div className="tx-kicker" style={{ margin: '16px 0 6px' }}>
              Parameter (raw Micheline, not decoded)
            </div>
            <div
              className="tx-card"
              style={{
                padding: 12, fontSize: 11, lineHeight: 1.45,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-all', color: 'var(--tx-fg-subtle)',
                maxHeight: 160, overflowY: 'auto',
              }}
            >
              {pending.parametersPreview}
            </div>
          </>
        )}
      </div>

      <div className="tx-action-bar" style={{ gap: 8 }}>
        <Button variant="outline" full onClick={() => respond('reject')}>Reject</Button>
        <Button variant="accent"  full onClick={() => respond('approve')}>Sign</Button>
      </div>
    </div>
  );
}
