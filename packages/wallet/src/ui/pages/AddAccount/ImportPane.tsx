import { isValidEdsk, isValidMnemonic } from '@tezosx/wallet-core/domain/validation';
import { shortAddr } from '@tezosx/wallet-core/shared/format';
import type { AccountSummary } from '@tezosx/wallet-core/shared/messages';
import { Identicon } from '../../tx/Identicon';
import { Icon } from '../../tx/Icon';
import { Ack } from '../../tx/Ack';
import { Meta } from '../../tx/Meta';
import type { Pick, TzMode } from './types';

export function ImportPane({
  pick,
  tzMode, setTzMode,
  tzImportValue, setTzImportValue,
  evmImportValue, setEvmImportValue,
  duplicate, duplicateAck, setDuplicateAck,
  parseError,
  onSwitchToExisting,
}: {
  pick:           Pick;
  tzMode:         TzMode; setTzMode: (m: TzMode) => void;
  tzImportValue:  string; setTzImportValue: (s: string) => void;
  evmImportValue: string; setEvmImportValue: (s: string) => void;
  duplicate:      AccountSummary | null;
  duplicateAck:   boolean; setDuplicateAck: (b: boolean) => void;
  parseError:     string | null;
  onSwitchToExisting: () => void;
}) {
  const isTezos = pick.kind === 'tezos';
  const value   = isTezos ? tzImportValue : evmImportValue;
  const setValue = isTezos ? setTzImportValue : setEvmImportValue;

  const trimmed = value.trim();
  const shape   = isTezos
    ? (tzMode === 'mnemonic'
        ? isValidMnemonic(trimmed.toLowerCase())
        : isValidEdsk(trimmed))
    : trimmed.length >= 64 && parseError == null;

  const wordCount = isTezos && tzMode === 'mnemonic' && trimmed !== ''
    ? trimmed.split(/\s+/).filter(Boolean).length
    : null;

  const showInvalid = !shape && trimmed !== '';
  const showValid   = shape && parseError == null;
  const taClass     = `ta${showInvalid ? ' invalid' : ''}${showValid ? ' valid' : ''}`;

  const validLine = isTezos
    ? (tzMode === 'mnemonic' ? `Valid · ${wordCount} words` : 'Valid · edsk')
    : `Valid · ${trimmed.replace(/^0x/, '').length} hex chars`;

  return (
    <>
      <div className="tx-add-import-card">
        {isTezos && (
          <div className="tx-segmented" style={{ marginBottom: 10 }}>
            <button type="button" aria-pressed={tzMode === 'mnemonic'} onClick={() => setTzMode('mnemonic')}>
              Recovery phrase
            </button>
            <button type="button" aria-pressed={tzMode === 'edsk'} onClick={() => setTzMode('edsk')}>
              Private key (edsk)
            </button>
          </div>
        )}
        <textarea
          className={taClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isTezos
            ? (tzMode === 'mnemonic' ? 'whisper kingdom giraffe …' : 'edsk…')
            : '0xa1c2b3d4…'}
        />
        {trimmed !== '' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {shape ? (
              <Meta tone="ok">{validLine}</Meta>
            ) : (
              <Meta tone="bad">
                {isTezos
                  ? (tzMode === 'mnemonic'
                      ? 'Invalid — expected 12, 15, 18, 21 or 24 words'
                      : 'Invalid Tezos secret key')
                  : 'Expected 64 hex chars (with or without 0x prefix)'}
              </Meta>
            )}
            {wordCount != null && (
              <span style={{ fontSize: 10.5, color: 'var(--tx-fg-subtle)', marginTop: 8 }}>
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
            )}
          </div>
        )}
        {parseError != null && (
          <div style={{ fontSize: 11, color: 'var(--tx-danger)', marginTop: 4 }}>{parseError}</div>
        )}
      </div>

      {duplicate != null && (
        <div className="tx-add-dup-card">
          <div className="top">
            <span className="ico"><Icon name="alert" size={14} /></span>
            <div>
              <div className="ti">Already in your wallet</div>
              <div className="body">This {isTezos ? 'phrase' : 'key'} derives an account you've already imported.</div>
            </div>
          </div>
          <div className="mini-account">
            <Identicon seed={duplicate.primaryAddress} />
            <div className="info">
              <div className="nm">{duplicate.label?.trim() || 'Existing account'}</div>
              <div className="ad">
                {shortAddr(duplicate.primaryAddress)}
                {duplicate.secondaryAddress && <> · {shortAddr(duplicate.secondaryAddress)}</>}
              </div>
            </div>
            <button type="button" className="switch-btn" onClick={onSwitchToExisting}>
              Switch to it <Icon name="chevron-right" size={10} />
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <Ack accent={isTezos ? 'purple' : 'cyan'} checked={duplicateAck} onToggle={() => setDuplicateAck(!duplicateAck)}>
              Add it again anyway — I'll use it under a different label.
            </Ack>
          </div>
        </div>
      )}
    </>
  );
}
