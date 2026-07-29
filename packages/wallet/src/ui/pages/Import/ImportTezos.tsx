import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidEdsk, isValidMnemonic } from '@tezosx/wallet-core/domain/validation';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { TopBar } from '../../tx/TopBar';
import { PasswordFields } from './PasswordFields';

type TzMode = 'mnemonic' | 'edsk';

export function ImportTezos({ onDone }: { onDone: () => void }) {
  const navigate           = useNavigate();
  const [mode, setMode]    = useState<TzMode>('mnemonic');
  const [secret, setSec]   = useState('');
  const [password, setPwd] = useState('');
  const [confirm,  setCnf] = useState('');
  const [error,    setErr] = useState<unknown>(null);
  const [loading,  setLd]  = useState(false);

  const switchMode = (m: TzMode) => { setMode(m); setSec(''); setErr(null); };

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr(new Error('Password must be at least 8 characters'));
    if (password !== confirm) return setErr(new Error('Passwords do not match'));
    setLd(true);
    try {
      if (mode === 'mnemonic') {
        const trimmed = secret.trim().toLowerCase();
        if (!isValidMnemonic(trimmed)) throw new Error('Invalid BIP39 mnemonic');
        await sendPopupRequest({ type: 'IMPORT_WALLET', mnemonic: trimmed, password });
      } else {
        const trimmed = secret.trim();
        if (!isValidEdsk(trimmed)) throw new Error('Invalid Tezos secret key (expected edsk…)');
        await sendPopupRequest({ type: 'IMPORT_SECRET_KEY', edsk: trimmed, password });
      }
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
      <TopBar title="Import Tezos wallet" onBack={() => navigate(-1)} />

      <div className="tx-page-scroll" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 14 }}>
          {mode === 'mnemonic'
            ? 'Paste your 12/15/18/21/24-word BIP39 mnemonic. Words are separated by spaces.'
            : 'Paste a Tezos secret key (edsk…). This imports a single standalone account.'}
        </div>

        <div className="tx-runtime-toggle" style={{ display: 'flex', marginBottom: 16 }}>
          <button className={mode === 'mnemonic' ? 'on l1' : ''} onClick={() => switchMode('mnemonic')} style={{ flex: 1 }}>
            Recovery phrase
          </button>
          <button className={mode === 'edsk' ? 'on l2' : ''} onClick={() => switchMode('edsk')} style={{ flex: 1 }}>
            Private key
          </button>
        </div>

        <textarea
          className="tx-input mono"
          value={secret}
          onChange={(e) => setSec(e.target.value)}
          placeholder={mode === 'mnemonic' ? 'harbor slope violet …' : 'edsk…'}
          style={{ height: mode === 'mnemonic' ? 120 : 80, padding: 14, resize: 'none', lineHeight: 1.55 }}
        />
        <div className="tx-field-hint">Your secret never leaves this device.</div>

        <PasswordFields
          password={password} setPassword={setPwd}
          confirm={confirm}   setConfirm={setCnf}
          error={error}
        />
      </div>

      <div className="tx-action-bar">
        <Button variant="accent" full disabled={loading} onClick={submit}>
          {loading ? 'Importing…' : 'Import wallet'}
        </Button>
      </div>
    </div>
  );
}
