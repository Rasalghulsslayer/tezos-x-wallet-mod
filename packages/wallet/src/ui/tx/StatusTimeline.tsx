import { useEffect, useState } from 'react';
import type { TxStatus } from '@/domain/tx-status';

type StepKey   = 'broadcasting' | 'included' | 'finalized';
type StepState = 'pending' | 'active' | 'done' | 'failed';

interface StepView {
  key:    StepKey;
  label:  string;
  sub:    string;
  state:  StepState;
}

const STEP_ORDER: readonly StepKey[] = ['broadcasting', 'included', 'finalized'];

function labelFor(key: StepKey, runtime: 'l1' | 'l2'): string {
  if (key === 'broadcasting') return 'Broadcasted';
  if (key === 'included')     return runtime === 'l2' ? 'Settled on EVM' : 'Included';
  return runtime === 'l2' ? 'Finalized on L2' : 'Finalized';
}

function fillWidthFor(status: TxStatus): string {
  if (status.stage === 'broadcasting') return '18%';
  if (status.stage === 'included')     return '62%';
  if (status.stage === 'finalized')    return '100%';
  if (status.stage === 'failed')       return '100%';
  return '18%'; // unavailable — rail stops at the failed node visually
}

export function StatusTimeline({ status, runtime, startedAt }: {
  status:     TxStatus;
  runtime:    'l1' | 'l2';
  startedAt:  number;
}) {
  const isFailed      = status.stage === 'failed' || status.stage === 'unavailable';
  const reached: Record<StepKey, boolean> = {
    broadcasting: true,
    included:     status.stage === 'included' || status.stage === 'finalized',
    finalized:    status.stage === 'finalized',
  };
  const firstUnreached = STEP_ORDER.findIndex((k) => !reached[k]);
  const elapsed        = useElapsed(startedAt);

  const blockLevel =
    status.stage === 'included' || status.stage === 'finalized'
      ? status.blockLevel
      : null;
  const confirmations =
    status.stage === 'finalized' ? status.confirmations : null;

  const subFor = (key: StepKey, state: StepState): string => {
    if (key === 'broadcasting') return formatAgo(elapsed);
    if (key === 'included' && blockLevel != null) return `block #${blockLevel.toLocaleString()}`;
    if (key === 'included' && state === 'failed')  return 'unreachable';
    if (key === 'finalized' && confirmations != null) {
      
      if (confirmations === 0) return runtime === 'l2' ? 'L1-anchored' : 'L1';
      return `${confirmations} confirmation${confirmations === 1 ? '' : 's'}`;
    }
    return '—';
  };

  const stateFor = (key: StepKey, idx: number): StepState => {
    if (isFailed && key !== 'broadcasting' && !reached[key]) {
      return idx === firstUnreached ? 'failed' : 'pending';
    }
    if (reached[key]) return 'done';
    return idx === firstUnreached && !isFailed ? 'active' : 'pending';
  };

  const steps: StepView[] = STEP_ORDER.map((key, idx) => {
    const state = stateFor(key, idx);
    return { key, label: labelFor(key, runtime), sub: subFor(key, state), state };
  });

  const failedClass = isFailed ? ' is-failed' : '';

  return (
    <div className="tx-status-timeline" role="status" aria-live="polite">
      <div className="tx-status-rail">
        <div
          className={`tx-status-rail-fill${failedClass}`}
          style={{ width: fillWidthFor(status) }}
        />
      </div>
      <div className="tx-status-steps">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`tx-status-step ${s.state}${s.key === 'included' ? ' included' : ''}`}
            aria-current={s.state === 'active' ? 'step' : undefined}
          >
            <div className="tx-status-node">{nodeGlyph(s.state)}</div>
            <span className="tx-status-step-label">{s.label}</span>
            <span className="tx-status-step-sub">{s.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function nodeGlyph(state: StepState) {
  if (state === 'done') {
    return (
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
        <path d="M2 5l2 2 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'active') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8">
        <circle cx="4" cy="4" r="2.2" fill="currentColor" />
      </svg>
    );
  }
  if (state === 'failed') {
    return (
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M2 2l4 4M6 2l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - startedAt);
}

function formatAgo(elapsedMs: number): string {
  const s = Math.round(elapsedMs / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
