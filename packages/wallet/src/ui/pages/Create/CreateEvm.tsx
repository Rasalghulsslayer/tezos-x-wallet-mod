import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomEvmPrivateKey, deriveEvmAccount } from '@tezosx/wallet-core/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { TopBar } from '../../tx/TopBar';
import { Dots } from '../../tx/Dots';
import { toast } from '../../tx/Toast';
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
