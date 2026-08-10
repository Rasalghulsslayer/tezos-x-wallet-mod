import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@tezosx/wallet-core/domain/error';
import { Button } from '../tx/Button';
import { ErrorCard } from '../tx/ErrorCard';
import { ErrorInline } from '../tx/ErrorInline';
import { Icon } from '../tx/Icon';
import { LogoMark } from '../tx/LogoMark';

export function Unlock({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [password, setPwd] = useState('');
  const [error, setErr]    = useState<unknown>(null);
  const [loading, setLd]   = useState(false);

  // Forgot-password recovery: the vault ciphertext cannot be opened without
  // the password, so recovery wipes it and walks back through import. The
  // confirm stage spells out what a seed-phrase re-import does and does not
  // restore before anything is destroyed.
  const [stage, setStage]       = useState<'unlock' | 'recover'>('unlock');
  const [ack, setAck]           = useState(false);
  const [resetErr, setResetErr] = useState<unknown>(null);
  const [resetting, setRst]     = useState(false);

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

  const cancelRecover = () => {
    setStage('unlock');
    setAck(false);
    setResetErr(null);
  };

  const resetAndReimport = async () => {
    setResetErr(null);
    setRst(true);
    try {
      await sendPopupRequest({ type: 'RESET_WALLET' });
      navigate('/import', { replace: true });
    } catch (e) {
      setResetErr(e);
    } finally {
      setRst(false);
    }
  };

  if (stage === 'recover') {
    return (
      <div className="tx-page">
        <div className="tx-page-scroll" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em' }}>Reset this wallet?</div>
          <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginTop: 6 }}>
            Your password can't be recovered — it never leaves this device. Resetting erases the
            encrypted vault so you can start over from your seed phrase.
          </div>

          <div className="tx-err-card">
            <span className="tx-err-ico" aria-hidden="true">
              <Icon name="alert" size={16} />
            </span>
            <div className="tx-err-body">
              <div className="tx-err-title">Know what comes back before you reset</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div className="tx-kicker" style={{ color: 'var(--tx-success)' }}>Recovered</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx-fg)' }}>
                    Accounts derived from your seed phrase. Re-import it; derived accounts can be
                    re-added at the same addresses.
                  </div>
                </div>
                <div>
                  <div className="tx-kicker" style={{ color: 'var(--tx-danger)' }}>Not recovered</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx-fg)' }}>
                    Tezos secret keys (edsk) and EVM private keys imported outside the phrase —
                    re-import them separately — and account labels.
                  </div>
                </div>
                <div>
                  <div className="tx-kicker">Kept</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--tx-fg)' }}>
                    Your contacts.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: 16 }}>
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              style={{ marginTop: 2, accentColor: 'var(--tx-danger)' }}
            />
            <span style={{ fontSize: 13 }}>
              I understand accounts imported outside my seed phrase cannot be recovered from it
            </span>
          </label>

          {resetErr != null && <ErrorCard error={formatError(resetErr)} />}
        </div>

        <div className="tx-action-bar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="danger" full disabled={!ack || resetting} onClick={() => void resetAndReimport()}>
            {resetting ? 'Resetting…' : 'Reset wallet & re-import'}
          </Button>
          <Button variant="ghost" full disabled={resetting} onClick={cancelRecover}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

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
          onClick={() => setStage('recover')}
          style={{
            marginTop: 14,
            background: 'transparent',
            border: 0,
            color: 'var(--tx-fg-muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Forgot password? Reset & re-import
        </button>
      </div>
    </div>
  );
}
