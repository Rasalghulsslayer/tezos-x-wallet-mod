import { useState } from 'react';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { ErrorInline } from '../../tx/ErrorInline';
import { toast } from '../../tx/Toast';

/**
 * Bottom-sheet content for the Settings "Change password" flow. Owns its own
 * password-bearing state so unmounting the sheet drops it; every exit path
 * (success, cancel) additionally clears the fields explicitly, and an error
 * retry only keeps the fields the user does not have to re-enter.
 */
export function ChangePasswordView({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [err,     setErr]     = useState<unknown>(null);
  const [loading, setLd]      = useState(false);

  const clearAll = () => {
    setCurrent(''); setNext(''); setConfirm(''); setErr(null);
  };

  const cancel = () => {
    clearAll();
    onClose();
  };

  const submit = async () => {
    setErr(null);
    if (next.length < 8) {
      // The new password must be replaced, so it (and its confirmation) is
      // scrubbed for a fresh attempt; the current password stays.
      setNext(''); setConfirm('');
      return setErr(new Error('Password must be at least 8 characters'));
    }
    if (next !== confirm) {
      setConfirm('');
      return setErr(new Error('Passwords do not match'));
    }
    setLd(true);
    try {
      await sendPopupRequest({ type: 'CHANGE_PASSWORD', currentPassword: current, newPassword: next });
      clearAll();
      onClose();
      toast('Password changed');
    } catch (e) {
      // The rejected credential is scrubbed and retyped; the new password the
      // user already confirmed is kept for the retry.
      setCurrent('');
      setErr(e);
    } finally {
      setLd(false);
    }
  };

  return (
    <>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Change password</div>
      <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
        Re-seals this wallet on this device. Your secrets and addresses are unchanged.
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <label>
          <span className="tx-field-label">Current password</span>
          <input
            className="tx-input"
            type="password"
            value={current}
            autoFocus
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
          />
        </label>
        <label>
          <span className="tx-field-label">New password</span>
          <input
            className="tx-input"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        <label>
          <span className="tx-field-label">Confirm new password</span>
          <input
            className="tx-input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat it"
          />
        </label>

        {err != null && <ErrorInline error={formatError(err)} />}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" onClick={cancel}>Cancel</Button>
          <Button
            variant="accent"
            full
            type="submit"
            disabled={loading || current.length === 0 || next.length === 0 || confirm.length === 0}
          >
            {loading ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </>
  );
}
