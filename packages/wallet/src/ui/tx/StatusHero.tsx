import { useState } from 'react';
import type { TxStatus } from '@/lib/tx-status';
import { FINALIZED_AFTER_BLOCKS } from '@/lib/constants';

type Asset = 'XTZ' | 'USDC';

interface Props {
  status:  TxStatus;
  runtime: 'l1' | 'l2';
  amount:  string;
  asset:   Asset;
  to:      string;
}

export function StatusHero({ status, runtime, amount, asset, to }: Props) {
  const variant = visualVariant(status);
  return (
    <div className="tx-status-hero">
      <div className={`tx-status-hero-icon ${variant}`}>{glyphFor(variant)}</div>
      <div>
        <h2 className="tx-status-hero-title">{titleFor(status)}</h2>
        <div className="tx-status-hero-amt">
          <span className="num">{amount}</span> {asset} → {to}
        </div>
        <div className="tx-status-hero-route">{routeFor(status, runtime)}</div>
      </div>
      <EtaChip status={status} />
    </div>
  );
}

type Variant = 'broadcasting' | 'included' | 'finalized' | 'failed';

function visualVariant(status: TxStatus): Variant {
  switch (status.stage) {
    case 'broadcasting': return 'broadcasting';
    case 'included':     return 'included';
    case 'finalized':    return 'finalized';
    case 'failed':       return 'failed';
    case 'unavailable':  return 'failed';
  }
}

function titleFor(status: TxStatus): string {
  switch (status.stage) {
    case 'broadcasting': return 'Broadcasting…';
    case 'included':     return 'Included in block';
    case 'finalized':    return 'Sent';
    case 'failed':       return 'Transaction failed';
    case 'unavailable':  return "Couldn't confirm";
  }
}

function routeFor(status: TxStatus, runtime: 'l1' | 'l2'): string {
  const runtimeLabel = runtime === 'l1' ? 'L1 native' : 'L1 → L2 · NAC';
  if (status.stage === 'broadcasting') return `${runtimeLabel} · Tezos X Previewnet`;
  if (status.stage === 'included')     return `Block #${status.blockLevel.toLocaleString()}`;
  if (status.stage === 'finalized')    return `Finalized · ${runtimeLabel}`;
  if (status.stage === 'failed')       return `${runtimeLabel} · ${status.reason}`;
  return `${runtimeLabel} · status unavailable`;
}

function glyphFor(variant: Variant) {
  if (variant === 'broadcasting') {
    return (
      <span className="tx-status-glyph">
        <svg className="tx-status-spinner" width="72" height="72" viewBox="0 0 72 72">
          <circle className="track" cx="36" cy="36" r="33" strokeWidth="2" fill="none" />
          <circle className="arc"   cx="36" cy="36" r="33" strokeWidth="2" fill="none" />
        </svg>
        <svg className="tx-status-bcast" width="34" height="34" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="3" fill="var(--tx-purple)" />
          <path className="arc-mid" d="M11 17a6 6 0 0 1 12 0" stroke="var(--tx-purple)" strokeWidth="1.8" strokeLinecap="round" />
          <path className="arc-mid" d="M11 17a6 6 0 0 0 12 0" stroke="var(--tx-purple)" strokeWidth="1.8" strokeLinecap="round" />
          <path className="arc-out" d="M7 17a10 10 0 0 1 20 0"  stroke="var(--tx-purple)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <path className="arc-out" d="M7 17a10 10 0 0 0 20 0"  stroke="var(--tx-purple)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </svg>
      </span>
    );
  }
  if (variant === 'included') {
    return (
      <>
        <span className="tx-status-pulse cyan" />
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="6" y="6" width="20" height="20" rx="4" stroke="var(--tx-cyan)" strokeWidth="2" />
          <path d="M11 16l4 4 6-8" stroke="var(--tx-cyan)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </>
    );
  }
  if (variant === 'finalized') {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="14" stroke="var(--tx-success)" strokeWidth="2" />
        <path d="M11 18.5l4.5 4.5L25 13" stroke="var(--tx-success)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" stroke="var(--tx-danger)" strokeWidth="2" />
      <path d="M11 11l10 10M21 11l-10 10" stroke="var(--tx-danger)" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

function EtaChip({ status }: { status: TxStatus }) {
  const startedAt = useStartedAt();
  if (status.stage === 'unavailable' || status.stage === 'failed') return null;

  const variant =
    status.stage === 'finalized' ? 'finalized' :
    status.stage === 'included'  ? 'included'  :
                                   'broadcasting';
  const text =
    status.stage === 'finalized' ? `${status.confirmations} confirmation${status.confirmations === 1 ? '' : 's'} · ${formatElapsed(startedAt)} total`
    : status.stage === 'included' ? `Finalizing · ${maxConfirmations(status.blockLevel)} / ${FINALIZED_AFTER_BLOCKS} confirmations`
    : 'Usually included in ~10 s';

  return (
    <div className={`tx-status-eta ${variant}`}>
      <span className="tx-status-blip" aria-hidden="true" />
      {text}
    </div>
  );
}

function useStartedAt(): number {
  const [t] = useState(() => Date.now());
  return t;
}

function formatElapsed(startedAt: number): string {
  const s = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** While in 'included' stage we don't know the actual confirmations count
 *  yet (the poller fires only on stage transition); show a conservative 1. */
function maxConfirmations(_blockLevel: number): number {
  return 1;
}
