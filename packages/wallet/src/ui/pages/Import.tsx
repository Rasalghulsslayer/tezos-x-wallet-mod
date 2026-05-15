import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isValidEdsk, isValidMnemonic } from '@/domain/validation';
import { normaliseEvmPrivateKey } from '@/shared/evm-signing';
import { sendPopupRequest } from '@/shared/messaging';
import { formatError } from '@/domain/error';
import { Button } from '../tx/Button';
import { TopBar } from '../tx/TopBar';
import { ErrorInline } from '../tx/ErrorInline';

type Kind     = 'tezos' | 'evm';
type TzMode   = 'mnemonic' | 'edsk';

export function Import({ onDone }: { onDone: () => void }) {
  const [params] = useSearchParams();
  const kind: Kind = params.get('kind') === 'evm' ? 'evm' : 'tezos';

  return kind === 'evm' ? <ImportEvm onDone={onDone} /> : <ImportTezos onDone={onDone} />;
}

// ── Tezos: mnemonic or edsk ───────────────────────────────────────────────────

function ImportTezos({ onDone }: { onDone: () => void }) {
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

// ── EVM: hex private key only ─────────────────────────────────────────────────

function ImportEvm({ onDone }: { onDone: () => void }) {
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

function PasswordFields({
  password, setPassword, confirm, setConfirm, error,
}: {
  password: string;
  setPassword: (s: string) => void;
  confirm: string;
  setConfirm: (s: string) => void;
  error: unknown;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
      <label>
        <span className="tx-field-label">Password</span>
        <input className="tx-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
      </label>
      <label>
        <span className="tx-field-label">Confirm password</span>
        <input className="tx-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error != null && <ErrorInline error={formatError(error)} />}
    </div>
  );
}
