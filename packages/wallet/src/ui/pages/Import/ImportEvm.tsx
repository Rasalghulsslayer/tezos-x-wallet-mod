import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { normaliseEvmPrivateKey } from '@/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { TopBar } from '../../tx/TopBar';
import { PasswordFields } from './PasswordFields';

export function ImportEvm({ onDone }: { onDone: () => void }) {
  const navigate           = useNavigate();
  const [secret, setSec]   = useState('');
  const [password, setPwd] = useState('');
  const [confirm,  setCnf] = useState('');
  const [error,    setErr] = useState<unknown>(null);
  const [loading,  setLd]  = useState(false);

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr(new Error('Password must be at least 8 characters'));
    if (password !== confirm) return setErr(new Error('Passwords do not match'));
    setLd(true);
    try {
      const normalised = normaliseEvmPrivateKey(secret);
      await sendPopupRequest({ type: 'IMPORT_EVM_PRIVKEY', privateKey: normalised, password });
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
      <TopBar title="Import EVM wallet" onBack={() => navigate(-1)} />

      <div className="tx-page-scroll" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: 'var(--tx-fg-muted)', marginBottom: 14 }}>
          Paste a 64-character hex private key (with or without the <code>0x</code> prefix).
        </div>

        <textarea
          className="tx-input mono"
          value={secret}
          onChange={(e) => setSec(e.target.value)}
          placeholder="0x… (64 hex characters)"
          style={{ height: 88, padding: 14, resize: 'none', lineHeight: 1.55 }}
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
