/**
 * ActivityFilters: direction segmented control + runtime popover.
 *
 * The direction segment is always visible (All · Sent · Received). The runtime
 * filter sits behind a 30px icon button to the right; tapping it opens a popover
 * with the four runtime options (Any / Michelson / EVM / Cross-runtime). When a
 * non-default runtime is active, an inline filter chip appears next to the
 * segment with the runtime colour swatch and an × to clear it.
 */

import { useEffect, useRef, useState } from 'react';

export type DirectionFilter = 'all' | 'sent' | 'received';
export type RuntimeFilter   = 'all' | 'l1' | 'l2' | 'cross';

const RUNTIME_LABELS: Record<RuntimeFilter, string> = {
  all:   'Any',
  l1:    'Michelson',
  l2:    'EVM',
  cross: 'Cross-runtime',
};

export function ActivityFilters({
  direction, setDirection,
  runtime,   setRuntime,
}: {
  direction:    DirectionFilter;
  setDirection: (d: DirectionFilter) => void;
  runtime:      RuntimeFilter;
  setRuntime:   (r: RuntimeFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current != null && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runtimeActive = runtime !== 'all';

  return (
    <div className="tx-activity-filters" ref={wrapRef}>
      <div className="tx-seg" role="tablist" aria-label="Direction filter">
        <button
          role="tab"
          aria-selected={direction === 'all'}
          className={direction === 'all' ? 'on' : ''}
          onClick={() => setDirection('all')}
        >
          All
        </button>
        <button
          role="tab"
          aria-selected={direction === 'sent'}
          className={direction === 'sent' ? 'on' : ''}
          onClick={() => setDirection('sent')}
        >
          Sent
        </button>
        <button
          role="tab"
          aria-selected={direction === 'received'}
          className={direction === 'received' ? 'on' : ''}
          onClick={() => setDirection('received')}
        >
          Received
        </button>
      </div>

      <div className="tx-activity-filters-tail">
        {runtimeActive && (
          <span className={`tx-filter-chip ${runtime}`}>
            <span className={`tx-filter-chip-swatch ${runtime}`} aria-hidden />
            {RUNTIME_LABELS[runtime]}
            <span
              className="x"
              role="button"
              aria-label="Clear runtime filter"
              tabIndex={0}
              onClick={() => setRuntime('all')}
              onKeyDown={(e) => { if (e.key === 'Enter') setRuntime('all'); }}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </span>
          </span>
        )}

        <button
          className={`tx-filter-btn${open || runtimeActive ? ' on' : ''}`}
          aria-label="Runtime filter"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {runtimeActive && !open && <span className="badge" aria-hidden />}
        </button>

        {open && (
          <div className="tx-filter-pop" role="dialog" aria-label="Runtime">
            <h6>Runtime</h6>
            <div className="chips">
              <RuntimeChip kind="all"   active={runtime === 'all'}   onClick={() => { setRuntime('all');   setOpen(false); }} />
              <RuntimeChip kind="l1"    active={runtime === 'l1'}    onClick={() => { setRuntime('l1');    setOpen(false); }} />
              <RuntimeChip kind="l2"    active={runtime === 'l2'}    onClick={() => { setRuntime('l2');    setOpen(false); }} />
              <RuntimeChip kind="cross" active={runtime === 'cross'} onClick={() => { setRuntime('cross'); setOpen(false); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RuntimeChip({
  kind, active, onClick,
}: {
  kind:    RuntimeFilter;
  active:  boolean;
  onClick: () => void;
}) {
  const swatch = kind === 'all' ? 'any' : kind;
  return (
    <button
      className={`chip${active ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={`swatch ${swatch}`} aria-hidden />
      {RUNTIME_LABELS[kind]}
    </button>
  );
}
