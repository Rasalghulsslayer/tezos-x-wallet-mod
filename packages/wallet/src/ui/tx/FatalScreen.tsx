import type { FormattedError } from '@tezosx/wallet-core/domain/error';

const BUILD_VERSION = '0.5.0';

export function FatalScreen({
  error,
  onReload = () => window.location.reload(),
  onSupport,
}: {
  error:     FormattedError;
  onReload?: () => void;
  onSupport?: () => void;
}) {
  return (
    <div className="tx-fatal">
      <div className="tx-fatal-body">
        <div className="tx-fatal-icon">
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
            <path d="M18 4 33 30H3L18 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M18 14v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="18" cy="26" r="1.2" fill="currentColor" />
          </svg>
        </div>
        <h2 className="tx-fatal-title">{error.title}</h2>
        <p className="tx-fatal-detail">{error.detail}</p>
        <div className="tx-fatal-actions">
          <button className="tx-fatal-cta" type="button" onClick={onReload}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M12 6.5A5 5 0 1 1 10.2 2.5M12 1.5V5h-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reload wallet
          </button>
          {onSupport && (
            <button className="tx-fatal-cta ghost" type="button" onClick={onSupport}>
              Contact support
            </button>
          )}
        </div>
        <div className="tx-fatal-meta">
          {(error.code ?? 'UNKNOWN').replace(/[^a-z0-9]/gi, '_').toUpperCase()} · build {BUILD_VERSION}
        </div>
      </div>
    </div>
  );
}
