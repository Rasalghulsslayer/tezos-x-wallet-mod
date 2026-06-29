import type { FormattedError } from '@tezosx/wallet-core/domain/error';

export function ErrorInline({ error, showDetail = true }: { error: FormattedError; showDetail?: boolean }) {
  return (
    <div className="tx-err-inline" role="alert" aria-live="polite">
      <span className="tx-err-inline-ico" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5.25" stroke="currentColor" strokeWidth="1.25" />
          <path d="M6 3.5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="6" cy="8.5" r="0.65" fill="currentColor" />
        </svg>
      </span>
      <div>
        <div className="tx-err-inline-title">{error.title}</div>
        {showDetail && error.detail !== error.title && (
          <div className="tx-err-inline-detail">{error.detail}</div>
        )}
      </div>
    </div>
  );
}
