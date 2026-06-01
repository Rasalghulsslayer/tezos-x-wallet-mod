import { formatError } from '@/domain/error';
import { Button } from '../../tx/Button';
import { ErrorInline } from '../../tx/ErrorInline';

export function PasswordStage({
  password, setPassword, confirm, setConfirm, error, loading, submitLabel, onSubmit,
}: {
  password:    string;
  setPassword: (s: string) => void;
  confirm:     string;
  setConfirm:  (s: string) => void;
  error:       unknown;
  loading:     boolean;
  submitLabel: string;
  onSubmit:    () => void;
}) {
  return (
    <>
      <div className="tx-page-scroll" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
          Unlocks this wallet on this device. It's separate from your secret.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            <span className="tx-field-label">Password</span>
            <input className="tx-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label>
            <span className="tx-field-label">Confirm password</span>
            <input className="tx-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat it" />
          </label>
          {error != null && <ErrorInline error={formatError(error)} />}
        </div>
      </div>
      <div className="tx-action-bar">
        <Button variant="accent" full disabled={loading || password.length < 8 || password !== confirm} onClick={onSubmit}>
          {loading ? 'Creating…' : submitLabel}
        </Button>
      </div>
    </>
  );
}
