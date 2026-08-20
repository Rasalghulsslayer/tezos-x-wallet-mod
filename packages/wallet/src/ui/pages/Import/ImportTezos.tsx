import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BIP39_LENGTHS, isValidEdsk, isValidMnemonic } from '@tezosx/wallet-core/domain/validation';
import { sendPopupRequest } from '@/shared/messaging';
import { Button } from '../../tx/Button';
import { TopBar } from '../../tx/TopBar';
import { Icon } from '../../tx/Icon';
import { Meta } from '../../tx/Meta';
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

  const trimmed    = secret.trim();
  const wordCount  = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
  const shapeValid = mode === 'mnemonic' ? isValidMnemonic(trimmed.toLowerCase()) : isValidEdsk(trimmed);

  // Count-based hints teach better than a bare "invalid" — say what was seen
  // and what was expected.
  const meta = trimmed === '' ? null
    : shapeValid
      ? <Meta tone="ok">{mode === 'mnemonic' ? `Valid · ${wordCount} words` : 'Valid · edsk'}</Meta>
      : mode === 'mnemonic'
        ? ((BIP39_LENGTHS as readonly number[]).includes(wordCount)
            ? <Meta tone="bad">Invalid · not a BIP-39 phrase. Check spelling and word order.</Meta>
            : <Meta tone="bad">Invalid · {wordCount} {wordCount === 1 ? 'word' : 'words'}. Expected 12, 15, 18, 21 or 24.</Meta>)
        : <Meta tone="bad">Invalid · expected a secret key starting with edsk…</Meta>;

  const submit = async () => {
    setErr(null);
    if (password.length < 8) return setErr(new Error('Password must be at least 8 characters'));
    if (password !== confirm) return setErr(new Error('Passwords do not match'));
    setLd(true);
    try {
      if (mode === 'mnemonic') {
        await sendPopupRequest({ type: 'IMPORT_WALLET', mnemonic: trimmed.toLowerCase(), password });
      } else {
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
      <TopBar title="Import Tezos wallet" onBack={() => navigate(-1)} right={<span className="tx-badge neutral">Michelson</span>} />

      <div className="tx-page-scroll" style={{ padding: 20 }}>
        {/* Both secret formats import a Michelson-side account, so the active
            segment keeps the purple accent in either mode. */}
        <div className="tx-segmented" style={{ marginBottom: 12 }}>
          <button aria-pressed={mode === 'mnemonic'} onClick={() => switchMode('mnemonic')}>
            Recovery phrase
          </button>
          <button aria-pressed={mode === 'edsk'} onClick={() => switchMode('edsk')}>
            Private key
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--tx-fg-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {mode === 'mnemonic'
            ? 'Paste your 12/15/18/21/24-word BIP39 mnemonic. Words are separated by spaces.'
            : 'Paste a Tezos secret key (edsk…). This imports a single standalone account.'}
        </div>

        <textarea
          className={`tx-input mono${trimmed !== '' && !shapeValid ? ' bad' : ''}`}
          value={secret}
          onChange={(e) => setSec(e.target.value)}
          placeholder={mode === 'mnemonic' ? 'harbor slope violet …' : 'edsk…'}
          style={{
            height: mode === 'mnemonic' ? 104 : 76,
            padding: 12,
            resize: 'none',
            lineHeight: 1.6,
            wordBreak: mode === 'edsk' ? 'break-all' : 'normal',
          }}
        />
        {meta}
        <div className="tx-field-hint" style={{ marginTop: meta != null ? 8 : 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="shield" size={12} color="var(--tx-fg-subtle)" />Your secret never leaves this device.
        </div>

        <div className="tx-divider" style={{ margin: '16px 0' }} />

        <PasswordFields
          password={password} setPassword={setPwd}
          confirm={confirm}   setConfirm={setCnf}
          error={error}
        />
      </div>

      <div className="tx-action-bar">
        <Button variant="accent" full disabled={loading || !shapeValid} onClick={submit}>
          {loading ? 'Importing…' : 'Import wallet'}
        </Button>
      </div>
    </div>
  );
}
