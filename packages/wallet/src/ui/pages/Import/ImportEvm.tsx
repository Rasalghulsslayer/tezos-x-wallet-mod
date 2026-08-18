import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { normaliseEvmPrivateKey } from '@tezosx/wallet-core/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { TopBar } from '../../tx/TopBar';
import { Icon } from '../../tx/Icon';
import { Meta } from '../../tx/Meta';
import { PasswordFields } from './PasswordFields';

export function ImportEvm({ onDone }: { onDone: () => void }) {
  const navigate           = useNavigate();
  const [secret, setSec]   = useState('');
  const [password, setPwd] = useState('');
  const [confirm,  setCnf] = useState('');
  const [error,    setErr] = useState<unknown>(null);
  const [loading,  setLd]  = useState(false);

  const hexBody    = secret.trim().replace(/^0x/i, '');
  const isHex      = /^[0-9a-fA-F]*$/.test(hexBody);
  const shapeValid = isHex && hexBody.length === 64;

  const meta = secret.trim() === '' ? null
    : shapeValid
      ? <Meta tone="ok">Valid · 64 hex characters</Meta>
      : isHex
        ? <Meta tone="bad">Invalid · {hexBody.length} of 64 hex characters</Meta>
        : <Meta tone="bad">Invalid · contains non-hex characters</Meta>;

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
      <TopBar title="Import EVM wallet" onBack={() => navigate(-1)} right={<span className="tx-badge neutral">EVM</span>} />

      <div className="tx-page-scroll" style={{ padding: 20 }}>
        <div style={{ fontSize: 12.5, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginBottom: 14 }}>
          Paste a 64-character hex private key (with or without the <span className="tx-mono">0x</span> prefix).
        </div>

        <textarea
          className={`tx-input mono cy${secret.trim() !== '' && !shapeValid ? ' bad' : ''}`}
          value={secret}
          onChange={(e) => setSec(e.target.value)}
          placeholder="0x… (64 hex characters)"
          style={{ height: 84, padding: 12, resize: 'none', lineHeight: 1.6, wordBreak: 'break-all' }}
        />
        {meta}
        <div className="tx-field-hint" style={{ marginTop: meta != null ? 8 : 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="shield" size={12} color="var(--tx-fg-subtle)" />Your secret never leaves this device.
        </div>

        <div className="tx-divider" style={{ margin: '16px 0' }} />

        <PasswordFields
          cyan
          password={password} setPassword={setPwd}
          confirm={confirm}   setConfirm={setCnf}
          error={error}
        />
      </div>

      <div className="tx-action-bar">
        <Button variant="accent-cyan" full disabled={loading || !shapeValid} onClick={submit}>
          {loading ? 'Importing…' : 'Import wallet'}
        </Button>
      </div>
    </div>
  );
}
