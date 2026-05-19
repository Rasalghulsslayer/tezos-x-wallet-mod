/**
 * ActivityRow: presentation component for one item in the Activity feed.
 *
 * Layout follows the Activity redesign — a 3-column grid (identicon · body ·
 * amount) where the identicon's outer ring carries the runtime (purple = L1,
 * cyan = L2, gradient = cross-runtime). Pending becomes a conic-spinner in
 * the warning colour; failed flips the ring to danger. The verb · arrow ·
 * mono address pattern in `t1` replaces the previous pre-rendered title.
 */

import type { ActivityRowVM, RuntimeBadge } from '../view-models/activity-vm';

export function ActivityRow({
  vm,
  onPrimaryClick,
  onSecondaryClick,
}: {
  vm:                ActivityRowVM;
  onPrimaryClick:    () => void;
  onSecondaryClick?: () => void;
}) {
  const identClass = identClassOf(vm.runtimeBadge, vm.status);
  const tagClass   = tagClassOf(vm.runtimeBadge);
  const valueClass = valueClassOf(vm);
  const showLinks  = vm.status !== 'pending' && vm.primaryUrl !== '';

  const primary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPrimaryClick();
  };
  const secondary = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSecondaryClick?.();
  };

  return (
    <div
      className="tx-activity"
      onClick={onPrimaryClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPrimaryClick(); }}
    >
      <div className={identClass} aria-hidden>
        <div className="ring" />
        <div className="core"><CoreGlyph vm={vm} /></div>
      </div>

      <div className="body">
        <div className="t1">
          <span className="verb">{vm.verb}</span>
          {vm.arrow !== '·' && <span className="arrow">{vm.arrow}</span>}
          <span className="addr">{vm.counterparty}</span>
        </div>
        <div className="t2">
          {vm.status === 'failed' ? (
            <span className="failed-tag">Failed</span>
          ) : (
            <span className={tagClass}>{vm.runtimeTag}</span>
          )}
          <span className="sep" aria-hidden>·</span>
          {vm.status === 'pending'
            ? <span className="pending-tag">{vm.ago}</span>
            : <span>{vm.ago}</span>}
        </div>
      </div>

      <div className="amt">
        {vm.amount.value !== '' && (
          <div className={valueClass}>
            {vm.amount.sign}{vm.amount.value} {vm.asset}
          </div>
        )}
        {showLinks && (
          <div className="links">
            <a
              aria-label={vm.runtimeBadge === 'l2' ? 'View on blockscout' : 'View on tzkt'}
              onClick={primary}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onPrimaryClick(); }}
            >
              <ExternalArrow />
            </a>
            {vm.secondaryUrl != null && onSecondaryClick != null && (
              <a
                aria-label="View on the other explorer"
                onClick={secondary}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSecondaryClick(); }}
              >
                <ExternalArrow />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function identClassOf(badge: RuntimeBadge, status: ActivityRowVM['status']): string {
  const base = 'tx-activity-ident';
  const runtime = badge === 'l1' ? 'l1' : badge === 'l2' ? 'l2' : 'cross';
  if (status === 'pending') return `${base} ${runtime} pending`;
  if (status === 'failed')  return `${base} ${runtime} failed`;
  return `${base} ${runtime}`;
}

function tagClassOf(badge: RuntimeBadge): string {
  return badge === 'l1' ? 'tag l1' : badge === 'l2' ? 'tag l2' : 'tag cross';
}

function valueClassOf(vm: ActivityRowVM): string {
  if (vm.status === 'failed')  return 'v failed';
  if (vm.status === 'pending') return 'v pending';
  if (vm.amount.sign === '+')  return 'v pos';
  if (vm.amount.sign === '−')  return 'v neg';
  return 'v';
}

function CoreGlyph({ vm }: { vm: ActivityRowVM }) {
  if (vm.status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (vm.verb === 'Contract call') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <rect x="2.5" y="3" width="9" height="8" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 6h5M4.5 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (vm.verb === 'Signed message') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 10l3-7 2 5 2-2 1 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // transfer / unknown — choose by direction
  if (vm.runtimeBadge === 'cross') {
    // sent vs received in cross-runtime: arrow into / out of an EVM target
    if (vm.arrow === '←') {
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M9 6H3M9 8H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M3 4l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path d="M3 6h6M3 8h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M9 4l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (vm.arrow === '←') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4v4M5 6l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (vm.arrow === '·') {
    // self-transfer / unknown: dot inside circle
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  // sent default
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 7l2 2 3-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExternalArrow() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M5 7 10 2M10 6V2H6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
