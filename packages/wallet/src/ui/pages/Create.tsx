import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newMnemonic } from '@/lib/seed';
import { sendPopupRequest } from '@/lib/messaging';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { Dots } from '../tx/Dots';

type Stage = 'intro' | 'reveal' | 'confirm' | 'password';

export function Create({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [stage, setStage]   = useState<Stage>('intro');
  const [mnemonic]          = useState(() => newMnemonic());
  const words               = useMemo(() => mnemonic.split(' '), [mnemonic]);

  const [ack1, setAck1]     = useState(false);
  const [ack2, setAck2]     = useState(false);
  const [revealed, setRevealed] = useState(false);

  const positions           = useMemo(() => pickPositions(words.length), [words.length]);
  const [confirmVals, setCv] = useState(['', '', '']);
  const allCorrect          = positions.every((p, i) => confirmVals[i].trim().toLowerCase() === words[p - 1]);

  const [password, setPwd]  = useState('');
  const [confirm,  setCnf]  = useState('');
  const [error,    setErr]  = useState<string | null>(null);
  const [loading,  setLd]   = useState(false);

  const stageIdx = { intro: 0, reveal: 1, confirm: 2, password: 3 }[stage];

  const back = () => {
    if (stage === 'intro') navigate(-1);
    else if (stage === 'reveal') setStage('intro');
    else if (stage === 'confirm') setStage('reveal');
    else setStage('confirm');
  };

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr('Password must be at least 8 characters');
    if (password !== confirm) return setErr('Passwords do not match');
    setLd(true);
    try {
      await sendPopupRequest({ type: 'CREATE_WALLET', mnemonic, password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="tx-page">
      <TopBar
        title={
          stage === 'intro' ? 'Create wallet' :
          stage === 'reveal' ? 'Recovery phrase' :
          stage === 'confirm' ? 'Confirm phrase' :
          'Set password'
        }
        onBack={back}
        right={<Dots i={stageIdx} n={4} />}
      />

      {stage === 'intro' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 8 }}>
              Before we generate your recovery phrase
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 20 }}>
              These words unlock both your L1 and L2 addresses. There's no recovery beyond them.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-purple)' }} />
                <span style={{ fontSize: 13 }}>I'll write the phrase down offline. Tezos X can't restore it for me.</span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-purple)' }} />
                <span style={{ fontSize: 13 }}>Anyone with this phrase can move my funds on both chains.</span>
              </label>
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!ack1 || !ack2} onClick={() => setStage('reveal')}>
              Generate phrase
            </Button>
          </div>
        </>
      )}

      {stage === 'reveal' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 14 }}>
              Write these {words.length} words down in order. Keep them offline.
            </div>
            <div style={{ position: 'relative' }}>
              <div className={`tx-seed-grid ${revealed ? '' : 'blurred'}`}>
                {words.map((w, i) => (
                  <div className="tx-seed-word" key={i}>
                    <span className="n">{i + 1}</span><span className="w">{w}</span>
                  </div>
                ))}
              </div>
              {!revealed && (
                <div className="tx-seed-overlay" onClick={() => setRevealed(true)}>
                  <div className="tx-seed-reveal-box">
                    <Icon name="eye" size={28} color="var(--tx-fg)" />
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Tap to reveal</div>
                    <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', textAlign: 'center', maxWidth: 240 }}>
                      Make sure nobody's looking at your screen.
                    </div>
                  </div>
                </div>
              )}
            </div>
            {revealed && (
              <button className="tx-btn ghost sm" style={{ marginTop: 14 }} onClick={() => setRevealed(false)}>
                <Icon name="eye-off" size={14} />Hide
              </button>
            )}
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!revealed} onClick={() => setStage('confirm')}>
              I've written it down
            </Button>
          </div>
        </>
      )}

      {stage === 'confirm' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
              Type the words that go in these positions.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {positions.map((p, i) => (
                <label key={p}>
                  <span className="tx-field-label">Word #{p}</span>
                  <input
                    className="tx-input mono"
                    value={confirmVals[i]}
                    placeholder="…"
                    onChange={(e) => {
                      const next = [...confirmVals];
                      next[i] = e.target.value;
                      setCv(next);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!allCorrect} onClick={() => setStage('password')}>
              Continue
            </Button>
          </div>
        </>
      )}

      {stage === 'password' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
              Unlocks this wallet on this device. It's separate from your recovery phrase.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label>
                <span className="tx-field-label">Password</span>
                <input className="tx-input" type="password" value={password} onChange={(e) => setPwd(e.target.value)} placeholder="At least 8 characters" />
              </label>
              <label>
                <span className="tx-field-label">Confirm password</span>
                <input className="tx-input" type="password" value={confirm} onChange={(e) => setCnf(e.target.value)} placeholder="Repeat it" />
              </label>
              {error != null && <p style={{ fontSize: 12, color: 'var(--tx-danger)' }}>{error}</p>}
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={loading || password.length < 8 || password !== confirm} onClick={submit}>
              {loading ? 'Creating…' : 'Open wallet'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function pickPositions(n: number): [number, number, number] {
  // Deterministic-ish: pick 3 spread positions
  const a = Math.max(1, Math.floor(n * 0.2));
  const b = Math.max(a + 1, Math.floor(n * 0.5));
  const c = Math.max(b + 1, Math.floor(n * 0.8));
  return [a, b, c];
}
