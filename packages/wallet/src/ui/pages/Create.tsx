import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { newMnemonic } from '@/shared/seed';
import { randomEvmPrivateKey, deriveEvmAccount } from '@/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@/domain/error';
import { Button } from '../tx/Button';
import { Icon } from '../tx/Icon';
import { TopBar } from '../tx/TopBar';
import { Dots } from '../tx/Dots';
import { ErrorInline } from '../tx/ErrorInline';
import { toast } from '../tx/Toast';

type Kind  = 'tezos' | 'evm';
type Stage = 'intro' | 'reveal' | 'confirm' | 'password';

export function Create({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const kind: Kind = params.get('kind') === 'evm' ? 'evm' : 'tezos';
  return kind === 'evm'
    ? <CreateEvm onDone={onDone} />
    : <CreateTezos onDone={onDone} />;
}

// ── Tezos (BIP-39 mnemonic) ───────────────────────────────────────────────────

function CreateTezos({ onDone }: { onDone: () => void }) {
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
              These words unlock your Michelson runtime account. There's no recovery beyond them.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-purple)' }} />
                <span style={{ fontSize: 13 }}>I'll write the phrase down offline. Tezos X can't restore it for me.</span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-purple)' }} />
                <span style={{ fontSize: 13 }}>Anyone with this phrase can move my funds.</span>
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

// ── EVM (random 32-byte secp256k1 private key) ────────────────────────────────

function CreateEvm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('intro');

  const [{ privateKey, address }] = useState(() => {
    const pk = randomEvmPrivateKey();
    return { privateKey: pk, address: deriveEvmAccount(pk).address };
  });

  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ackBacked, setAckBacked] = useState(false);

  const [password, setPwd] = useState('');
  const [confirm,  setCnf] = useState('');
  const [error,    setErr] = useState<unknown>(null);
  const [loading,  setLd]  = useState(false);

  const stageIdx = { intro: 0, reveal: 1, confirm: 2, password: 3 }[stage];

  const back = () => {
    if (stage === 'intro') navigate(-1);
    else if (stage === 'reveal')   setStage('intro');
    else if (stage === 'confirm')  setStage('reveal');
    else setStage('confirm');
  };

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr(new Error('Password must be at least 8 characters'));
    if (password !== confirm) return setErr(new Error('Passwords do not match'));
    setLd(true);
    try {
      await sendPopupRequest({ type: 'IMPORT_EVM_PRIVKEY', privateKey, password });
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
          stage === 'intro'    ? 'Create wallet' :
          stage === 'reveal'   ? 'Private key' :
          stage === 'confirm'  ? 'Confirm backup' :
                                 'Set password'
        }
        onBack={back}
        right={<Dots i={stageIdx} n={4} />}
      />

      {stage === 'intro' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, marginBottom: 8 }}>
              Before we generate your EVM private key
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 20 }}>
              This 64-character key signs every EVM transaction. There's no recovery beyond it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack1} onChange={(e) => setAck1(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-cyan)' }} />
                <span style={{ fontSize: 13 }}>I'll save the key offline. Tezos X can't restore it for me.</span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={ack2} onChange={(e) => setAck2(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--tx-cyan)' }} />
                <span style={{ fontSize: 13 }}>Anyone with this key can move my funds.</span>
              </label>
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!ack1 || !ack2} onClick={() => setStage('reveal')}>
              Generate key
            </Button>
          </div>
        </>
      )}

      {stage === 'reveal' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div className="tx-kicker" style={{ marginBottom: 6 }}>EVM address</div>
            <div className="tx-mono" style={{ fontSize: 11, color: 'var(--tx-fg-muted)', wordBreak: 'break-all', marginBottom: 16 }}>
              {address}
            </div>

            <div className="tx-kicker" style={{ marginBottom: 6 }}>Private key</div>
            <div
              className="tx-mono"
              style={{
                fontSize: 12,
                wordBreak: 'break-all',
                padding: 14,
                borderRadius: 'var(--tx-r-md)',
                background: 'var(--tx-surface-2)',
                border: '1px solid var(--tx-border)',
                filter: revealed ? 'none' : 'blur(7px)',
                transition: 'filter 200ms',
                cursor: revealed ? 'default' : 'pointer',
                userSelect: revealed ? 'all' : 'none',
                lineHeight: 1.55,
              }}
              onClick={() => setRevealed(true)}
            >
              {'0x' + privateKey}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setRevealed((s) => !s)} leftIcon={<Icon name={revealed ? 'eye-off' : 'eye'} size={14} />}>
                {revealed ? 'Hide' : 'Reveal'}
              </Button>
              <Button
                variant="ghost"
                disabled={!revealed}
                onClick={() => {
                  void navigator.clipboard.writeText('0x' + privateKey);
                  toast('Private key copied');
                }}
                leftIcon={<Icon name="copy" size={14} />}
              >
                Copy
              </Button>
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!revealed} onClick={() => setStage('confirm')}>
              I've saved it
            </Button>
          </div>
        </>
      )}

      {stage === 'confirm' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
              Confirm you've backed up the key somewhere safe. We won't show it again until you reveal it in Settings.
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ackBacked}
                onChange={(e) => setAckBacked(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--tx-cyan)' }}
              />
              <span style={{ fontSize: 13 }}>I've stored my private key offline.</span>
            </label>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent" full disabled={!ackBacked} onClick={() => setStage('password')}>
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

// ── Shared password sub-stage ─────────────────────────────────────────────────

function PasswordStage({
  password, setPassword, confirm, setConfirm, error, loading, submitLabel, onSubmit,
}: {
  password: string;
  setPassword: (s: string) => void;
  confirm: string;
  setConfirm: (s: string) => void;
  error: unknown;
  loading: boolean;
  submitLabel: string;
  onSubmit: () => void;
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

function pickPositions(n: number): [number, number, number] {
  const a = Math.max(1, Math.floor(n * 0.2));
  const b = Math.max(a + 1, Math.floor(n * 0.5));
  const c = Math.max(b + 1, Math.floor(n * 0.8));
  return [a, b, c];
}
