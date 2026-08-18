import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomEvmPrivateKey, deriveEvmAccount } from '@tezosx/wallet-core/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { copySecretWithAutoClear } from '@/shared/clipboard';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { TopBar } from '../../tx/TopBar';
import { Dots } from '../../tx/Dots';
import { Ack } from '../../tx/Ack';
import { Note } from '../../tx/Note';
import { PasswordStage } from './PasswordStage';

type Stage = 'intro' | 'reveal' | 'confirm' | 'password';

export function CreateEvm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('intro');

  const [{ privateKey, address }] = useState(() => {
    const pk = randomEvmPrivateKey();
    return { privateKey: pk, address: deriveEvmAccount(pk).address };
  });

  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
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
          stage === 'intro'    ? 'Create wallet'   :
          stage === 'reveal'   ? 'Private key'     :
          stage === 'confirm'  ? 'Confirm backup'  :
                                 'Set password'
        }
        onBack={back}
        right={<Dots i={stageIdx} n={4} accent="cyan" />}
      />

      {stage === 'intro' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
              <span className="tx-stage-glyph cyan"><Icon name="key" size={17} /></span>
              <div>
                <div className="tx-kicker" style={{ marginBottom: 5 }}>EVM runtime</div>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', lineHeight: 1.18 }}>
                  Before we generate your EVM private key
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginBottom: 18 }}>
              This 64-character key signs every EVM transaction. There's no recovery beyond it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Ack accent="cyan" checked={ack1} onToggle={() => setAck1((v) => !v)}>
                I'll save the key offline. Tezos X can't restore it for me.
              </Ack>
              <Ack accent="cyan" checked={ack2} onToggle={() => setAck2((v) => !v)}>
                Anyone with this key can move my funds.
              </Ack>
            </div>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent-cyan" full disabled={!ack1 || !ack2} onClick={() => setStage('reveal')}>
              Generate key
            </Button>
          </div>
        </>
      )}

      {stage === 'reveal' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <Note warn icon="shield">Make sure nobody's looking at your screen.</Note>
            </div>
            <div className="tx-kicker" style={{ marginBottom: 6 }}>EVM address</div>
            <div className="tx-mono" style={{ fontSize: 11.5, color: 'var(--tx-fg-muted)', wordBreak: 'break-all', marginBottom: 16, lineHeight: 1.5 }}>
              {address}
            </div>

            <div className="tx-kicker" style={{ marginBottom: 6 }}>Private key</div>
            <div style={{ position: 'relative' }}>
              <div className={`tx-keyblock${revealed ? '' : ' blurred'}`} style={{ userSelect: revealed ? 'all' : 'none' }}>
                {'0x' + privateKey}
              </div>
              {!revealed && (
                <div className="tx-seed-overlay" onClick={() => setRevealed(true)}>
                  <Icon name="eye" size={22} color="var(--tx-fg)" />
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>Tap to reveal</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="ghost" size="sm" onClick={() => setRevealed((s) => !s)} leftIcon={<Icon name={revealed ? 'eye-off' : 'eye'} size={13} />}>
                {revealed ? 'Hide' : 'Reveal'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!revealed}
                onClick={() => {
                  copySecretWithAutoClear('0x' + privateKey);
                  setCopied(true);
                }}
                leftIcon={<Icon name="copy" size={13} />}
              >
                Copy
              </Button>
            </div>
            {copied && (
              <div style={{ marginTop: 12 }}>
                <Note icon="check">Private key copied · clipboard clears in 30 s</Note>
              </div>
            )}
          </div>
          <div className="tx-action-bar">
            <Button variant="accent-cyan" full disabled={!revealed} onClick={() => setStage('confirm')}>
              I've saved it
            </Button>
          </div>
        </>
      )}

      {stage === 'confirm' && (
        <>
          <div className="tx-page-scroll" style={{ padding: 20 }}>
            <div className="tx-kicker" style={{ marginBottom: 14 }}>EVM runtime · no seed phrase</div>
            <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginBottom: 16 }}>
              Confirm you've backed up the key somewhere safe. We won't show it again until you reveal it in Settings.
            </div>
            <Ack accent="cyan" checked={ackBacked} onToggle={() => setAckBacked((v) => !v)}>
              I've stored my private key offline.
            </Ack>
          </div>
          <div className="tx-action-bar">
            <Button variant="accent-cyan" full disabled={!ackBacked} onClick={() => setStage('password')}>
              Continue
            </Button>
          </div>
        </>
      )}

      {stage === 'password' && (
        <PasswordStage
          accent="cyan"
          password={password} setPassword={setPwd}
          confirm={confirm}   setConfirm={setCnf}
          error={error} loading={loading} submitLabel="Open wallet"
          onSubmit={submit}
        />
      )}
    </div>
  );
}
