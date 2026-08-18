import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { newMnemonic } from '@tezosx/wallet-core/shared/seed';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { TopBar } from '../../tx/TopBar';
import { Dots } from '../../tx/Dots';
import { Ack } from '../../tx/Ack';
import { Note } from '../../tx/Note';
import { Meta } from '../../tx/Meta';
import { PasswordStage } from './PasswordStage';
import { pickPositions } from './helpers';

type Stage = 'intro' | 'reveal' | 'confirm' | 'password';

export function CreateTezos({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [stage, setStage]   = useState<Stage>('intro');
  const [mnemonic]          = useState(() => newMnemonic());
  const words               = useMemo(() => mnemonic.split(' '), [mnemonic]);

  const [ack1, setAck1]     = useState(false);
  const [ack2, setAck2]     = useState(false);
  const [revealed, setRevealed] = useState(false);

  const positions           = useMemo(() => pickPositions(words.length), [words.length]);
  const [confirmVals, setCv] = useState(['', '', '']);
  const correctAt           = (i: number) => confirmVals[i].trim().toLowerCase() === words[positions[i] - 1];
  const allCorrect          = positions.every((_, i) => correctAt(i));
  // Flag a wrong word only once it can no longer become right by typing more
  // (not a prefix of the expected word) — mid-word typing stays quiet.
  const wrongAt = (i: number) => {
    const typed = confirmVals[i].trim().toLowerCase();
    return typed !== '' && !words[positions[i] - 1].startsWith(typed);
  };
  const firstWrong = positions.findIndex((_, i) => wrongAt(i));

  const [password, setPwd]  = useState('');
  const [confirm,  setCnf]  = useState('');
  const [error,    setErr]  = useState<unknown>(null);
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
    if (password.length < 8) return setErr(new Error('Password must be at least 8 characters'));
    if (password !== confirm) return setErr(new Error('Passwords do not match'));
    setLd(true);
    try {
      await sendPopupRequest({ type: 'CREATE_WALLET', mnemonic, password });
      onDone();
      navigate('/', { replace: true });
    } catch (e) {
      setErr(e);
    } finally {
      setLd(false);
    }
  };

  return (
    <div className="tx-page">
      <TopBar
        title={
          stage === 'intro'   ? 'Create wallet'  :
          stage === 'reveal'  ? 'Recovery phrase':
          stage === 'confirm' ? 'Confirm phrase' :
                                'Set password'
        }
        onBack={back}
        right={<Dots i={stageIdx} n={4} accent="purple" />}
      />

      {stage === 'intro' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <span className="tx-stage-glyph purple"><Icon name="seed" size={17} /></span>
              <div>
                <div className="tx-kicker" style={{ marginBottom: 5 }}>Michelson runtime</div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.18 }}>
                  Before we generate your recovery phrase
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginBottom: 18 }}>
              These words unlock your Michelson runtime account. There's no recovery beyond them.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Ack checked={ack1} onToggle={() => setAck1((v) => !v)}>
                I'll write the phrase down offline. Tezos X can't restore it for me.
              </Ack>
              <Ack checked={ack2} onToggle={() => setAck2((v) => !v)}>
                Anyone with this phrase can move my funds.
              </Ack>
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
            <div style={{ marginBottom: 12 }}>
              <Note warn icon="shield">Make sure nobody's looking at your screen.</Note>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="tx-kicker">Recovery phrase · {words.length} words</span>
              {revealed && (
                <button className="tx-btn ghost xs" onClick={() => setRevealed(false)}>
                  <Icon name="eye-off" size={12} />Hide
                </button>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--tx-fg-muted)', marginBottom: 12 }}>
              Write these {words.length} words down in order. Keep them offline.
            </div>
            <div style={{ position: 'relative' }}>
              <div className={`tx-seed-grid${revealed ? '' : ' blurred'}`}>
                {words.map((w, i) => (
                  <div className="tx-seed-word" key={i}>
                    <span className="n">{i + 1}</span><span className="w">{w}</span>
                  </div>
                ))}
              </div>
              {!revealed && (
                <div className="tx-seed-overlay" onClick={() => setRevealed(true)}>
                  <Icon name="eye" size={24} color="var(--tx-fg)" />
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Tap to reveal</div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-fg-muted)', textAlign: 'center', maxWidth: 210, lineHeight: 1.45 }}>
                    Make sure nobody's looking at your screen.
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <Note>
                This phrase restores every account you create in this wallet. A Tezos
                secret key or EVM private key you import isn't derived from it — back
                those up separately.
              </Note>
            </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {positions.map((p, i) => (
                <div key={p} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {/* Keeps .tx-field-label: it IS the field's label ("which word?")
                      and the class is the greppable/testable contract. */}
                  <span className={`tx-field-label tx-pos-chip${confirmVals[i] !== '' ? ' filled' : ''}`}>#{p}</span>
                  <input
                    className={`tx-input mono${wrongAt(i) ? ' bad' : ''}`}
                    style={{ flex: 1 }}
                    aria-label={`Word #${p}`}
                    value={confirmVals[i]}
                    placeholder="…"
                    onChange={(e) => {
                      const next = [...confirmVals];
                      next[i] = e.target.value;
                      setCv(next);
                    }}
                  />
                  {correctAt(i)
                    ? <span className="tx-ck on purple"><Icon name="check" size={12} strokeWidth={2.4} /></span>
                    : <span style={{ width: 18 }} />}
                </div>
              ))}
            </div>
            {firstWrong >= 0 && (
              <Meta tone="bad">Word #{positions[firstWrong]} doesn't match your phrase.</Meta>
            )}
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!allCorrect} onClick={() => setStage('password')}>
              Continue
            </Button>
          </div>
        </>
      )}

      {stage === 'password' && (
        <PasswordStage
          password={password} setPassword={setPwd}
          confirm={confirm}   setConfirm={setCnf}
          error={error} loading={loading} submitLabel="Open wallet"
          onSubmit={submit}
        />
      )}
    </div>
  );
}
