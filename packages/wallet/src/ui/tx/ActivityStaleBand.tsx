/**
 * ActivityStaleBand: soft amber slot under the TopBar that surfaces a
 * partial-fetch failure or "data is lagging" condition. Single-line, dismissible.
 */

export function ActivityStaleBand({
  title,
  detail,
  onDismiss,
}: {
  title:     string;
  detail?:   string;
  onDismiss: () => void;
}) {
  return (
    <div className="tx-status-band" role="status">
      <span className="ico" aria-hidden>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5 12.5 11h-11L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M7 5.5v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="7" cy="9.5" r=".55" fill="currentColor" />
        </svg>
      </span>
      <span className="txt">
        <strong>{title}</strong>
        {detail != null && detail !== '' && <> — {detail}</>}
      </span>
      <button className="x" aria-label="Dismiss" onClick={onDismiss}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
