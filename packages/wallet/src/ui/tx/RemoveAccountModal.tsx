import { useEffect, useRef, useState } from 'react';
import type { AccountSummary } from '../../shared/messages';
import { shortAddr } from '../../shared/format';

export function RemoveAccountModal({
  account,
  isLast,
  onClose,
  onConfirmed,
}: {
  account:     AccountSummary;
  isLast:      boolean;
  onClose:     () => void;
  onConfirmed: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = async () => {
    if (isLast || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirmed(password);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const displayName = account.label?.trim() != null && account.label.trim().length > 0
    ? account.label
    : shortAddr(account.primaryAddress);

  return (
    <Backdrop onDismiss={onClose}>
      <div className="tx-modal" role="dialog" aria-label="Remove account">
        <div className="tx-modal-title">Remove “{displayName}”?</div>
        <div className="tx-modal-detail">
          Back up the secret before continuing — once removed, this account is gone unless you re-import it.
        </div>
        {isLast ? (
          <div className="tx-modal-error">You can't remove your last account. Add another first.</div>
        ) : (
          <input
            ref={inputRef}
            className="tx-input"
            type="password"
            value={password}
            placeholder="Enter your wallet password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
            disabled={busy}
          />
        )}
        {error != null && <div className="tx-modal-error">{error}</div>}
        <div className="tx-modal-actions">
          <button type="button" className="tx-btn ghost sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="tx-btn danger sm"
            onClick={() => void submit()}
            disabled={busy || isLast || password.length === 0}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);
  return (
    <div className="tx-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      {children}
    </div>
  );
}
