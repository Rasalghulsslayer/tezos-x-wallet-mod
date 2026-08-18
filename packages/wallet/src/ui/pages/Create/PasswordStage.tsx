import { formatError } from '@tezosx/wallet-core/domain/error';
import { Button } from '../../tx/Button';
import { ErrorInline } from '../../tx/ErrorInline';
import { Icon } from '../../tx/Icon';
import { Meta } from '../../tx/Meta';

/**
 * Shared final stage of both create flows. The lock glyph next to the copy
 * makes the separation visual: this password is NOT the secret — nobody
 * should re-type their phrase here.
 */
export function PasswordStage({
  password, setPassword, confirm, setConfirm, error, loading, submitLabel, onSubmit, accent = 'purple',
}: {
  password:    string;
  setPassword: (s: string) => void;
  confirm:     string;
  setConfirm:  (s: string) => void;
  error:       unknown;
  loading:     boolean;
  submitLabel: string;
  onSubmit:    () => void;
  accent?:     'purple' | 'cyan';
}) {
  const cy    = accent === 'cyan' ? ' cy' : '';
  const match = password.length >= 8 && password === confirm;
  return (
    <>
      <div className="tx-page-scroll" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <span className="tx-stage-glyph neutral"><Icon name="lock" size={15} /></span>
          <span style={{ fontSize: 12.5, color: 'var(--tx-fg-muted)', lineHeight: 1.5 }}>
            Unlocks this wallet on this device. It's separate from your secret.
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            <span className="tx-field-label">Password</span>
            <input className={`tx-input${cy}`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
          <label>
            <span className="tx-field-label">Confirm password</span>
            <input className={`tx-input${cy}`} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat it" />
          </label>
          {match && <Meta tone="ok">Passwords match</Meta>}
          {error != null && <ErrorInline error={formatError(error)} />}
        </div>
      </div>
      <div className="tx-action-bar">
        <Button
          variant={accent === 'cyan' ? 'accent-cyan' : 'accent'}
          full
          disabled={loading || !match}
          onClick={onSubmit}
        >
          {loading ? 'Creating…' : submitLabel}
        </Button>
      </div>
    </>
  );
}
