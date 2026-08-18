import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError, isAuthError } from '@tezosx/wallet-core/domain/error';
import { Button } from '../tx/Button';
import { Ack } from '../tx/Ack';
import { ErrorCard } from '../tx/ErrorCard';
import { ErrorInline } from '../tx/ErrorInline';
import { Icon } from '../tx/Icon';

/** The unlock throttle rejects with "Too many attempts. Try again in Ns." —
 *  lift N so the cooldown can tick down live instead of showing a stale
 *  number the user has to re-trigger to refresh. */
function throttleSeconds(err: unknown): number | null {
  const m = /Too many attempts\. Try again in (\d+)s/.exec(err instanceof Error ? err.message : String(err));
  return m != null ? Number(m[1]) : null;
}

function fmtCooldown(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Unlock({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [password, setPwd] = useState('');
  const [error, setErr]    = useState<unknown>(null);
  const [loading, setLd]   = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Presentation-only ticker for the throttle countdown (the authoritative
  // clock lives in the keyring; this just keeps the shown number honest).
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

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
      const throttled = throttleSeconds(e);
      if (throttled != null) {
        // The cooldown note is the surface for a throttle — an ErrorInline on
        // top of it would say the same thing twice.
        setCooldown(throttled);
        setErr(null);
      } else {
        setErr(e);
      }
      // Clear the field only when the credential itself was refused; wiping it
      // on a network or internal failure reads as "wrong password".
      if (isAuthError(e)) setPwd('');
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

          {/* The checklist is the screen: three outcome-coloured rows let the
              user scan what survives before reading a word. */}
          <div className="tx-recover-card">
            <div className="head">
              <Icon name="alert" size={14} color="var(--tx-danger)" />
              <span>Know what comes back before you reset</span>
            </div>
            <div className="row">
              <span className="i"><Icon name="check" size={13} color="var(--tx-success)" /></span>
              <div>
                <div className="tx-kicker" style={{ color: 'var(--tx-success)' }}>Recovered</div>
                <div className="t">
                  Accounts derived from your seed phrase. Re-import it; derived accounts can be
                  re-added at the same addresses.
                </div>
              </div>
            </div>
            <div className="row">
              <span className="i"><Icon name="alert" size={13} color="var(--tx-danger)" /></span>
              <div>
                <div className="tx-kicker" style={{ color: 'var(--tx-danger)' }}>Not recovered</div>
                <div className="t">
                  Tezos secret keys (edsk) and EVM private keys imported outside the phrase —
                  re-import them separately — and account labels.
                </div>
              </div>
            </div>
            <div className="row">
              <span className="i"><Icon name="shield" size={13} color="var(--tx-fg-muted)" /></span>
              <div>
                <div className="tx-kicker">Kept</div>
                <div className="t">Your contacts.</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Ack checked={ack} onToggle={() => setAck(!ack)}>
              I understand accounts imported outside my seed phrase cannot be recovered from it
            </Ack>
          </div>

          {resetErr != null && <div style={{ marginTop: 12 }}><ErrorCard error={formatError(resetErr)} /></div>}
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
      <div className="tx-page-scroll" style={{ padding: '36px 22px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 14 }}>
          {/* The lock glyph shifts to warning while throttled — the state is
              readable before any text is. */}
          <span
            style={{
              width: 44, height: 44, borderRadius: 13,
              background: 'var(--tx-surface-2)',
              boxShadow: 'inset 0 0 0 1px var(--tx-border)',
              display: 'grid', placeItems: 'center',
            }}
          >
            <Icon name="lock" size={20} color={cooldown > 0 ? 'var(--tx-warning)' : 'var(--tx-fg-muted)'} />
          </span>
          <div>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-0.018em' }}>Welcome back</div>
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
          {cooldown > 0 && (
            <div className="tx-note warn" style={{ alignItems: 'center' }}>
              <span className="i"><Icon name="alert" size={13} color="var(--tx-warning)" /></span>
              <span>
                Too many attempts. Try again in{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--tx-warning)', fontWeight: 500 }}>
                  {fmtCooldown(cooldown)}
                </span>.
              </span>
            </div>
          )}
          <Button variant="accent" full type="submit" disabled={loading || cooldown > 0 || password.length === 0}>
            {loading ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>

        <button
          className="tx-btn ghost sm"
          onClick={() => setStage('recover')}
          style={{ marginTop: 12, alignSelf: 'center', fontSize: 12 }}
        >
          Forgot password? Reset & re-import
        </button>
      </div>
    </div>
  );
}
