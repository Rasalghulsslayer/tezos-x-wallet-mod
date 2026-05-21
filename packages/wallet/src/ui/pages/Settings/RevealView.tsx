import type { AccountSummary } from '@/shared/messages';
import { formatError } from '@/domain/error';
import { shortAddr } from '@/shared/format';
import { Button } from '../../tx/Button';
import { Icon } from '../../tx/Icon';
import { ErrorInline } from '../../tx/ErrorInline';
import { RevealActions } from './RevealActions';
import type { Secret } from './types';

export function RevealView({
  target, pwd, setPwd, secret, shown, setShown, err, loading,
  onBack, onCancel, onReveal,
}: {
  target:   AccountSummary | undefined;
  pwd:      string; setPwd: (s: string) => void;
  secret:   Secret | null;
  shown:    boolean; setShown: (b: boolean) => void;
  err:      unknown; loading: boolean;
  onBack?:  () => void;
  onCancel: () => void;
  onReveal: () => void;
}) {
  const headline = secret == null
    ? `Reveal ${target?.label?.trim() ? target.label : (target?.kind === 'tezos' ? 'recovery phrase' : 'private key')}`
    : secret.kind === 'mnemonic' ? 'Recovery phrase'
    : secret.kind === 'edsk'     ? 'Tezos secret key'
    :                              'EVM private key';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {onBack != null && secret == null && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to account picker"
            style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--tx-fg-muted)', cursor: 'pointer' }}
          >
            <Icon name="arrow-left" size={16} />
          </button>
        )}
        <div style={{ fontSize: 17, fontWeight: 600 }}>{headline}</div>
      </div>
      {target != null && (
        <div style={{ fontSize: 12, color: 'var(--tx-fg-muted)', marginBottom: 16 }}>
          {secret == null ? 'Enter your password. Never share your secret.' : 'Never share this with anyone.'}
          {' '}<span style={{ fontFamily: 'var(--tx-font-mono)' }}>{shortAddr(target.primaryAddress)}</span>
        </div>
      )}

      {secret == null ? (
        <>
          <input
            className="tx-input"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          {err != null && (
            <div style={{ marginTop: 10 }}>
              <ErrorInline error={formatError(err)} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
            <Button variant="accent" full disabled={loading || pwd.length === 0} onClick={onReveal}>
              {loading ? 'Decrypting…' : 'Reveal'}
            </Button>
          </div>
        </>
      ) : secret.kind === 'mnemonic' ? (
        <>
          <div className="tx-seed-grid" style={{ filter: shown ? 'none' : 'blur(6px)', transition: 'filter 220ms' }}>
            {secret.value.split(' ').map((w, i) => (
              <div className="tx-seed-word" key={i}>
                <span className="n">{i + 1}</span><span className="w">{w}</span>
              </div>
            ))}
          </div>
          <RevealActions shown={shown} onToggle={() => setShown(!shown)} value={secret.value} />
        </>
      ) : (
        <>
          <div
            className="tx-mono"
            style={{
              background: 'var(--tx-surface-2)',
              padding: 12,
              borderRadius: 'var(--tx-r-md)',
              fontSize: 11,
              wordBreak: 'break-all',
              filter: shown ? 'none' : 'blur(6px)',
              transition: 'filter 220ms',
            }}
          >
            {secret.kind === 'evm-pk' ? '0x' + secret.value : secret.value}
          </div>
          <RevealActions
            shown={shown}
            onToggle={() => setShown(!shown)}
            value={secret.kind === 'evm-pk' ? '0x' + secret.value : secret.value}
          />
        </>
      )}
    </>
  );
}
