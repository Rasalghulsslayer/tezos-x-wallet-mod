/**
 * ActivityNewPill: sticky pulsing pill that floats above the list when
 * the auto-refresh poll has discovered fresh items the user hasn't yet
 * promoted into the visible feed. Clicking the pill merges them in.
 */

export function ActivityNewPill({
  count,
  onClick,
}: {
  count:   number;
  onClick: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className="tx-new-pill-wrap" aria-live="polite">
      <button className="tx-new-pill" onClick={onClick} aria-label={`${count} new activity, refresh`}>
        <span className="ping" aria-hidden />
        <span>{count} new · refresh</span>
        <span className="arrow" aria-hidden>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M3 7l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}
