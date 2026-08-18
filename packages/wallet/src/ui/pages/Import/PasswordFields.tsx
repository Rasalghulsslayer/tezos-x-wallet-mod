import { formatError } from '@tezosx/wallet-core/domain/error';
import { ErrorInline } from '../../tx/ErrorInline';

export function PasswordFields({
  password, setPassword, confirm, setConfirm, error, cyan = false,
}: {
  password:    string;
  setPassword: (s: string) => void;
  confirm:     string;
  setConfirm:  (s: string) => void;
  error:       unknown;
  cyan?:       boolean;
}) {
  const cls = `tx-input${cyan ? ' cy' : ''}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label>
        <span className="tx-field-label">Password</span>
        <input className={cls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </label>
      <label>
        <span className="tx-field-label">Confirm password</span>
        <input className={cls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat it" />
      </label>
      {error != null && <ErrorInline error={formatError(error)} />}
    </div>
  );
}
