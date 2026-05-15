import { useState } from 'react';
import type { FormattedError } from '@/domain/error';

const COPY_FEEDBACK_MS = 1_600;

export function ErrorCard({ error }: { error: FormattedError }) {
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);

  const copyRaw = async () => {
    try {
      await navigator.clipboard.writeText(error.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch { /* clipboard blocked, ignore silently */ }
  };

  return (
    <div className="tx-err-card" role="alert">
      <span className="tx-err-ico" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 4.75v3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.75" fill="currentColor" />
        </svg>
      </span>
      <div className="tx-err-body">
        <div className="tx-err-title">{error.title}</div>
        <div className="tx-err-detail">{renderDetailWithMonoNumbers(error.detail)}</div>

        <div className="tx-err-disclosure">
          <button
            type="button"
            className="tx-err-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="tx-err-chev" aria-hidden="true">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M3.5 2 7 5 3.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {expanded ? 'Hide technical details' : 'Show technical details'}
          </button>

          {expanded && (
            <>
              <div className="tx-err-raw" tabIndex={0}>{error.raw}</div>
              <div className="tx-err-actions">
                <button type="button" className="tx-err-action" onClick={copyRaw}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Wrap numbers (digits, dots, ꜩ unit) in <span class="tx-err-num"> for mono styling. */
function renderDetailWithMonoNumbers(detail: string) {
  const parts = detail.split(/(\d[\d.]*\s?ꜩ?)/g);
  return parts.map((p, i) =>
    /^\d/.test(p)
      ? <span key={i} className="tx-err-num">{p}</span>
      : <span key={i}>{p}</span>,
  );
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.25" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 7.5V2.5A.5.5 0 0 1 2.5 2h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="m2.5 6 2.5 2.5L9.5 3.5" stroke="var(--tx-success)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
