import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { Button } from '../tx/Button';
import { ErrorInline } from '../tx/ErrorInline';
import { LogoMark } from '../tx/LogoMark';

export function Unlock({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [password, setPwd] = useState('');
  const [error, setErr]    = useState<unknown>(null);
  const [loading, setLd]   = useState(false);

  const submit = async () => {
    if (password.length === 0) return;
    setErr(null);
    setLd(true);
    try {
      await sendPopupRequest({ type: 'UNLOCK', password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr(e);
      setPwd('');
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="tx-page">
      <div className="tx-page-scroll" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
          <LogoMark size={48} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Welcome back</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6 }}>
              Enter your password to unlock.
            </div>
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input
            className="tx-input"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Password"
          />
          {error != null && <ErrorInline error={formatError(error)} showDetail={false} />}
          <Button variant="accent" full type="submit" disabled={loading || password.length === 0}>
            {loading ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>

        <button
          onClick={() => navigate('/import')}
          style={{
            marginTop: 14,
            background: 'transparent',
            border: 0,
            color: 'var(--tx-fg-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Forgot password? Import with seed phrase
        </button>
      </div>
    </div>
  );
}
